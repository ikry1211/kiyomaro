/**
 * SOCT 3カ年財務予測スクリプト
 * 使い方: node apps/strategy/scripts/forecast.mjs
 * 出力:
 *   - apps/strategy/data/forecast.json (機械可読)
 *   - apps/strategy/content/analysis/financial-forecast.mdx (サイト表示用)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const model = JSON.parse(readFileSync(join(ROOT, 'data/financial-model.json'), 'utf-8'));

// ---- ユーティリティ ----

/** "2026-04" → { year: 2026, month: 4 } */
function parseMonth(s) {
  const [y, m] = s.split('-').map(Number);
  return { year: y, month: m };
}

/** monthIndex(0=2026/4) → "2026-04" */
function monthLabel(i) {
  const base = parseMonth(model.period.start);
  const m = (base.month - 1 + i) % 12 + 1;
  const y = base.year + Math.floor((base.month - 1 + i) / 12);
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** "2026-07" が何番目のmonthIndexか */
function monthIndex(label) {
  const base = parseMonth(model.period.start);
  const target = parseMonth(label);
  return (target.year - base.year) * 12 + (target.month - base.month);
}

/** phases配列から該当月の値を取得 */
function getPhaseValue(phases, i) {
  let val = 0;
  for (const p of phases) {
    if (i >= monthIndex(p.from)) val = p.monthly;
  }
  return val;
}

/** milestones配列から該当月の値を線形補間で取得 */
function getMilestoneValue(milestones, i, key = 'monthly') {
  if (!milestones || milestones.length === 0) return 0;
  const firstIdx = monthIndex(milestones[0].month);
  if (i < firstIdx) return 0;

  let prev = milestones[0];
  for (const ms of milestones) {
    const msIdx = monthIndex(ms.month);
    if (i < msIdx) {
      // 前のマイルストーンと今のマイルストーンの間を線形補間
      const prevIdx = monthIndex(prev.month);
      const ratio = (i - prevIdx) / (msIdx - prevIdx);
      return prev[key] + (ms[key] - prev[key]) * ratio;
    }
    prev = ms;
  }
  return prev[key]; // 最後のマイルストーン以降は固定
}

// ---- 月次計算 ----

const N = model.period.months;
const results = [];

let cash = model.initialState.cash;
let debtKouko = model.initialState.debt.kouko;
let debtOther = model.initialState.debt.other;
let rakucoCustomers = model.initialState.rakucoCustomers;

for (let i = 0; i < N; i++) {
  const label = monthLabel(i);
  const r = { month: label };

  // --- 売上 ---

  // Rakuco
  const rakucoGrowth = getPhaseValue(
    model.revenue.rakuco.growth.map(g => ({ from: g.from, monthly: g.perMonth })), i
  );
  rakucoCustomers += rakucoGrowth;
  let rakucoPrice = model.revenue.rakuco.pricePerCustomer;
  const pi = model.revenue.rakuco.priceIncrease;
  if (pi.enabled && i >= monthIndex(pi.month)) {
    rakucoPrice = pi.newPrice;
  }
  // M&A売却チェック
  const ma = model.revenue.rakuco.maSale;
  const rakucoSold = ma.enabled && i >= monthIndex(ma.month);
  r.rakucoRev = rakucoSold ? 0 : Math.round(rakucoCustomers * rakucoPrice);
  r.rakucoCustomers = rakucoSold ? 0 : Math.round(rakucoCustomers);

  // 受託保守
  r.outsourcingRev = model.revenue.outsourcing.monthly;

  // 受託開発
  const devEnd = monthIndex(model.revenue.development.endMonth);
  r.developmentRev = i <= devEnd ? model.revenue.development.monthly : 0;

  // マーケティング
  r.marketingRev = getPhaseValue(model.revenue.marketing.phases, i);

  // eラーニング
  const elMs = model.revenue.eLearning.milestones;
  const elCustomers = Math.round(getMilestoneValue(elMs, i, 'customers'));
  const elPrice = getMilestoneValue(elMs, i, 'price');
  r.eLearningCustomers = elCustomers;
  r.eLearningRev = Math.round(elCustomers * model.revenue.eLearning.usersPerCustomer * elPrice);

  // Tetra LMS
  r.tetraRev = Math.round(getMilestoneValue(model.revenue.tetraLMS.milestones, i));

  // はなえみダイレクト
  r.hanaemiRev = Math.round(getMilestoneValue(model.revenue.hanaemiDirect.milestones, i));

  // 合計売上
  r.totalRevenue = r.rakucoRev + r.outsourcingRev + r.developmentRev +
    r.marketingRev + r.eLearningRev + r.tetraRev + r.hanaemiRev;

  // --- コスト ---

  // 受託事業コスト
  r.outsourcingVarCost = getPhaseValue(model.costs.outsourcing.phases, i);
  r.outsourcingFixedCost = model.costs.outsourcing.fixedCosts;

  // Rakucoコスト
  const rakucoVarBase = model.costs.rakuco.variableBase;
  const rakucoVarPerCust = model.costs.rakuco.variablePerCustomer;
  r.rakucoCost = rakucoSold ? 0 :
    rakucoVarBase + (r.rakucoCustomers - 104) * rakucoVarPerCust +
    getPhaseValue(model.costs.rakuco.salesCosts, i);

  // eラーニングコスト（スケール対応）
  r.eLearningCost = i >= monthIndex(model.costs.eLearning.startMonth)
    ? getPhaseValue(model.costs.eLearning.phases, i) : 0;

  // はなえみダイレクト開発・運用コスト
  r.hanaemiDirectCost = model.costs.hanaemiDirect
    ? getPhaseValue(model.costs.hanaemiDirect.phases, i) : 0;

  // マーケティング拡大コスト
  r.marketingExpCost = model.costs.marketingExpansion
    ? getPhaseValue(model.costs.marketingExpansion.phases, i) : 0;

  // 全社固定費
  r.companyFixed = model.costs.companyFixed.monthly;
  r.executiveFixed = model.costs.executiveFixed.monthly;

  // 利息
  r.interest = Math.max(0, model.costs.interest.initial - model.costs.interest.monthlyDecrease * i);

  r.totalCost = r.outsourcingVarCost + r.outsourcingFixedCost +
    r.rakucoCost + r.eLearningCost + r.hanaemiDirectCost +
    r.marketingExpCost + r.companyFixed + r.executiveFixed;

  // --- PL ---
  r.operatingIncome = r.totalRevenue - r.totalCost; // 営業損益（利息含まず）
  r.ordinaryIncome = r.operatingIncome - r.interest; // 経常利益 = 営業損益 - 支払利息

  // 法人税（経常利益がプラスの場合のみ）
  const taxRate = model.costs.corporateTax ? model.costs.corporateTax.rate : 0;
  r.tax = r.ordinaryIncome > 0 ? Math.round(r.ordinaryIncome * taxRate) : 0;
  r.netIncome = r.ordinaryIncome - r.tax; // 純利益

  // --- CF ---
  const repayKouko = model.initialState.debt.monthlyRepayment.kouko;
  const repayOther = model.initialState.debt.monthlyRepayment.other;
  r.borrowingRepayment = repayKouko + repayOther; // 元本返済
  r.cashFlow = r.netIncome - r.borrowingRepayment + r.interest;
  // CF = 純利益 + 利息（非現金調整）- 元本返済
  // = 純利益 - (元本返済 - 利息) ではなく:
  // CF = 営業損益 - 利息 - 税 - 元本返済
  r.cashFlow = r.ordinaryIncome - r.tax - r.borrowingRepayment;

  cash += r.cashFlow;
  r.cashBalance = Math.round(cash);

  // --- BS ---
  debtKouko = Math.max(0, debtKouko - repayKouko);
  debtOther = Math.max(0, debtOther - repayOther);
  r.totalDebt = Math.round(debtKouko + debtOther);
  r.netAssets = Math.round(r.cashBalance + model.initialState.otherAssets - r.totalDebt);

  // M&A 売却金入金
  if (ma.enabled && label === ma.month) {
    cash += ma.salePrice;
    r.cashBalance = Math.round(cash);
    r.netAssets = Math.round(r.cashBalance + model.initialState.otherAssets - r.totalDebt);
    r.maProceeds = ma.salePrice;
  }

  results.push(r);
}

// ---- 年度集計 ----
function annualSummary(startIdx, endIdx, fyLabel) {
  const months = results.slice(startIdx, endIdx);
  return {
    fy: fyLabel,
    totalRevenue: months.reduce((s, m) => s + m.totalRevenue, 0),
    rakucoRev: months.reduce((s, m) => s + m.rakucoRev, 0),
    outsourcingRev: months.reduce((s, m) => s + m.outsourcingRev, 0),
    marketingRev: months.reduce((s, m) => s + m.marketingRev, 0),
    eLearningRev: months.reduce((s, m) => s + m.eLearningRev, 0),
    tetraRev: months.reduce((s, m) => s + m.tetraRev, 0),
    hanaemiRev: months.reduce((s, m) => s + m.hanaemiRev, 0),
    totalCost: months.reduce((s, m) => s + m.totalCost, 0),
    operatingIncome: months.reduce((s, m) => s + m.operatingIncome, 0),
    ordinaryIncome: months.reduce((s, m) => s + m.ordinaryIncome, 0),
    totalInterest: months.reduce((s, m) => s + m.interest, 0),
    totalTax: months.reduce((s, m) => s + m.tax, 0),
    netIncome: months.reduce((s, m) => s + m.netIncome, 0),
    totalCashFlow: months.reduce((s, m) => s + m.cashFlow, 0),
    endCash: months[months.length - 1].cashBalance,
    endDebt: months[months.length - 1].totalDebt,
    endNetAssets: months[months.length - 1].netAssets,
    endRakucoCustomers: months[months.length - 1].rakucoCustomers,
    endELearningCustomers: months[months.length - 1].eLearningCustomers,
  };
}

const fy2026 = annualSummary(0, 12, 'FY2026');
const fy2027 = annualSummary(12, 24, 'FY2027');
const fy2028 = annualSummary(24, 36, 'FY2028');

// ---- 四半期集計 ----
function quarterlySummary(startIdx, label) {
  const months = results.slice(startIdx, startIdx + 3);
  if (months.length < 3) return null;
  return {
    quarter: label,
    totalRevenue: months.reduce((s, m) => s + m.totalRevenue, 0),
    operatingIncome: months.reduce((s, m) => s + m.operatingIncome, 0),
    ordinaryIncome: months.reduce((s, m) => s + m.ordinaryIncome, 0),
    cashFlow: months.reduce((s, m) => s + m.cashFlow, 0),
    endCash: months[2].cashBalance,
    endDebt: months[2].totalDebt,
    endNetAssets: months[2].netAssets,
  };
}

const quarters = [];
const qLabels = [
  'FY26-Q1', 'FY26-Q2', 'FY26-Q3', 'FY26-Q4',
  'FY27-Q1', 'FY27-Q2', 'FY27-Q3', 'FY27-Q4',
  'FY28-Q1', 'FY28-Q2', 'FY28-Q3', 'FY28-Q4',
];
for (let q = 0; q < 12; q++) {
  quarters.push(quarterlySummary(q * 3, qLabels[q]));
}

// ---- JSON出力 ----
const output = {
  generatedAt: new Date().toISOString(),
  modelVersion: '1.0',
  annual: [fy2026, fy2027, fy2028],
  quarterly: quarters,
  monthly: results,
};
writeFileSync(join(ROOT, 'data/forecast.json'), JSON.stringify(output, null, 2));

// ---- mdx出力 ----
const fmt = (n) => {
  if (n === 0) return '—';
  const k = Math.round(n / 1000);
  return `¥${k.toLocaleString()}K`;
};

const fmtM = (n) => {
  const m = (n / 1000000).toFixed(1);
  return `¥${m}M`;
};

const fmtPct = (n, d) => {
  if (d === 0) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
};

let mdx = `---
title: 財務予測（3カ年）
description: SOCT 3カ年財務予測 — 損益・キャッシュフロー・資産
---

# 財務予測（3カ年）

> **自動生成:** ${new Date().toISOString().split('T')[0]}
> **モデルバージョン:** 1.0
> **データソース:** [financial-model.json](https://github.com/kiyomaro/apps/strategy/data/financial-model.json)

> [!IMPORTANT]
> **ベースラインの前提:** Rakuco値上げ ${model.revenue.rakuco.priceIncrease.enabled ? 'あり' : 'なし'}、M&A売却 ${model.revenue.rakuco.maSale.enabled ? 'あり' : 'なし'}。
> eラーニング・Tetra LMS・はなえみダイレクトの成長は各事業計画ベースの目標値。

---

## 1. 年度サマリー

### 1.1. 損益（PL）

| 指標 | FY2026 | FY2027 | FY2028 |
|:---|---:|---:|---:|
| **売上高** | ${fmtM(fy2026.totalRevenue)} | ${fmtM(fy2027.totalRevenue)} | ${fmtM(fy2028.totalRevenue)} |
| 　Rakuco | ${fmtM(fy2026.rakucoRev)} | ${fmtM(fy2027.rakucoRev)} | ${fmtM(fy2028.rakucoRev)} |
| 　受託保守 | ${fmtM(fy2026.outsourcingRev)} | ${fmtM(fy2027.outsourcingRev)} | ${fmtM(fy2028.outsourcingRev)} |
| 　マーケティング | ${fmtM(fy2026.marketingRev)} | ${fmtM(fy2027.marketingRev)} | ${fmtM(fy2028.marketingRev)} |
| 　eラーニング | ${fmtM(fy2026.eLearningRev)} | ${fmtM(fy2027.eLearningRev)} | ${fmtM(fy2028.eLearningRev)} |
| 　Tetra LMS | ${fmtM(fy2026.tetraRev)} | ${fmtM(fy2027.tetraRev)} | ${fmtM(fy2028.tetraRev)} |
| 　はなえみダイレクト | ${fmtM(fy2026.hanaemiRev)} | ${fmtM(fy2027.hanaemiRev)} | ${fmtM(fy2028.hanaemiRev)} |
| 費用合計 | ${fmtM(fy2026.totalCost)} | ${fmtM(fy2027.totalCost)} | ${fmtM(fy2028.totalCost)} |
| **営業損益** | **${fmtM(fy2026.operatingIncome)}** | **${fmtM(fy2027.operatingIncome)}** | **${fmtM(fy2028.operatingIncome)}** |
| 支払利息 | ${fmtM(fy2026.totalInterest)} | ${fmtM(fy2027.totalInterest)} | ${fmtM(fy2028.totalInterest)} |
| **経常利益** | **${fmtM(fy2026.ordinaryIncome)}** | **${fmtM(fy2027.ordinaryIncome)}** | **${fmtM(fy2028.ordinaryIncome)}** |
| 法人税等（30%） | ${fmtM(fy2026.totalTax)} | ${fmtM(fy2027.totalTax)} | ${fmtM(fy2028.totalTax)} |
| **純利益** | **${fmtM(fy2026.netIncome)}** | **${fmtM(fy2027.netIncome)}** | **${fmtM(fy2028.netIncome)}** |

### 1.2. キャッシュフロー（CF）

| 指標 | FY2026 | FY2027 | FY2028 |
|:---|---:|---:|---:|
| 年間CF | ${fmtM(fy2026.totalCashFlow)} | ${fmtM(fy2027.totalCashFlow)} | ${fmtM(fy2028.totalCashFlow)} |
| 期末預金残高 | ${fmt(fy2026.endCash)} | ${fmt(fy2027.endCash)} | ${fmt(fy2028.endCash)} |

### 1.3. 資産（BS）

| 指標 | FY2026 | FY2027 | FY2028 |
|:---|---:|---:|---:|
| 期末預金残高 | ${fmt(fy2026.endCash)} | ${fmt(fy2027.endCash)} | ${fmt(fy2028.endCash)} |
| 期末負債残高 | ${fmt(fy2026.endDebt)} | ${fmt(fy2027.endDebt)} | ${fmt(fy2028.endDebt)} |
| **期末純資産** | **${fmt(fy2026.endNetAssets)}** | **${fmt(fy2027.endNetAssets)}** | **${fmt(fy2028.endNetAssets)}** |
| Rakuco社数 | ${fy2026.endRakucoCustomers}社 | ${fy2027.endRakucoCustomers}社 | ${fy2028.endRakucoCustomers}社 |
| eラーニング社数 | ${fy2026.endELearningCustomers}社 | ${fy2027.endELearningCustomers}社 | ${fy2028.endELearningCustomers}社 |

---

## 2. 四半期推移

| 四半期 | 売上 | 営業損益 | 経常利益 | CF | 預金残高 | 負債 | 純資産 |
|:---|---:|---:|---:|---:|---:|---:|---:|
`;

for (const q of quarters) {
  mdx += `| ${q.quarter} | ${fmt(q.totalRevenue)} | ${fmt(q.operatingIncome)} | ${fmt(q.ordinaryIncome)} | ${fmt(q.cashFlow)} | ${fmt(q.endCash)} | ${fmt(q.endDebt)} | ${fmt(q.endNetAssets)} |\n`;
}

mdx += `
---

## 3. 月次推移（主要KPI）

| 月 | Rakuco社数 | eラーニング社数 | 売上合計 | 営業損益 | CF | 預金残高 | 純資産 |
|:---|---:|---:|---:|---:|---:|---:|---:|
`;

for (const m of results) {
  // 四半期末と年度末のみ表示（毎月だと36行で長い）
  const monthNum = parseInt(m.month.split('-')[1]);
  const isQuarterEnd = [3, 6, 9, 12].includes(monthNum);
  const label = m.month.replace('-', '/');
  if (isQuarterEnd || m === results[0]) {
    mdx += `| ${label} | ${m.rakucoCustomers} | ${m.eLearningCustomers} | ${fmt(m.totalRevenue)} | ${fmt(m.operatingIncome)} | ${fmt(m.cashFlow)} | ${fmt(m.cashBalance)} | ${fmt(m.netAssets)} |\n`;
  }
}

mdx += `
---

## 4. 前提条件

### 4.1. 売上の前提

| 事業 | 前提 |
|:---|:---|
| **Rakuco** | 月+2〜3社成長。値上げ${model.revenue.rakuco.priceIncrease.enabled ? 'あり(10月〜¥21K)' : 'なし(¥18K維持)'}。M&A${model.revenue.rakuco.maSale.enabled ? 'あり' : 'なし'} |
| **eラーニング** | 7月課金開始。初年度¥400→2年目¥800。年度末30社→3年目160社 |
| **Tetra LMS** | テナント#2(10月)→スケール。手数料ベース |
| **はなえみダイレクト** | Q3ローンチ、段階的成長 |
| **受託保守** | ¥1,586K固定（InnoJin終了後） |
| **マーケティング** | 5月Rigna増額。FY2027〜新規獲得拡大 |

### 4.2. コストの前提

| 項目 | 前提 |
|:---|:---|
| 借入返済 | 月¥812K（公庫¥322K + その他¥491K）固定 |
| 利息 | 月¥123K起点、月¥1Kずつ減少 |
| 全社固定費 | ¥535K/月 固定 |
| 役員固定費 | ¥910K/月 固定 |
| 人件費増 | FY2028〜営業増員想定（+¥50K/月） |

> このファイルは \`node apps/strategy/scripts/forecast.mjs\` で自動生成されます。
> 前提条件の変更は [\`data/financial-model.json\`](../../data/financial-model.json) を編集してください。
`;

mkdirSync(join(ROOT, 'content/analysis'), { recursive: true });
writeFileSync(join(ROOT, 'content/analysis/financial-forecast.mdx'), mdx);

// ---- コンソール出力（サマリー） ----
console.log('\n📊 SOCT 3カ年財務予測 — サマリー');
console.log('═'.repeat(60));
console.log(`\n【年度サマリー】`);
for (const fy of [fy2026, fy2027, fy2028]) {
  console.log(`\n  ${fy.fy}:`);
  console.log(`    売上: ${fmtM(fy.totalRevenue)}  営業損益: ${fmtM(fy.operatingIncome)}  経常利益: ${fmtM(fy.ordinaryIncome)}`);
  console.log(`    CF: ${fmtM(fy.totalCashFlow)}  預金: ${fmt(fy.endCash)}  純資産: ${fmt(fy.endNetAssets)}`);
  console.log(`    Rakuco: ${fy.endRakucoCustomers}社  eラーニング: ${fy.endELearningCustomers}社`);
}

// 黒字転換月を探す
const plBreakeven = results.find(m => m.operatingIncome > 0);
const cfBreakeven = results.find(m => m.cashFlow > 0);
console.log(`\n【黒字転換ポイント】`);
console.log(`  PL黒字転換: ${plBreakeven ? plBreakeven.month : '期間内になし'}`);
console.log(`  CF黒字転換: ${cfBreakeven ? cfBreakeven.month : '期間内になし'}`);

console.log(`\n✅ 出力完了:`);
console.log(`  📄 data/forecast.json`);
console.log(`  📄 content/analysis/financial-forecast.mdx`);
