// 各メンバーの通話を15-20件抽出（結果別にバランスよく取得）
// Stage 0(短い通話)も含めるが、実質的なやり取りがある通話を多めに
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'conversations-20260320.json'), 'utf-8'));

const MEMBERS = ['鍵谷','福田','野島','日高','フジモト','カワカミ'];
const DISPLAY = {'鍵谷':'鍵谷','福田':'福田','野島':'野島','日高':'日高','フジモト':'藤本','カワカミ':'川上'};

for (const member of MEMBERS) {
  const convs = data.filter(c => c.agentName === member);
  
  // 結果別に分類
  const byResult = {};
  for (const c of convs) {
    if (!byResult[c.result]) byResult[c.result] = [];
    byResult[c.result].push(c);
  }
  
  // ターン数が多い順にソート（会話が深い順）
  for (const result in byResult) {
    byResult[result].sort((a, b) => b.turns - a.turns);
  }
  
  // 結果別に件数を配分（会話が深いものを優先）
  const samples = [];
  const quota = { 
    '不要（断り）': 5,       // 断り対応を見るため多め
    '再架電予定': 4,         // ヒアリング・クロージングを見るため
    '担当者不在': 3,         // アプローチを見るため
    '他システム導入済み': 3,  // 断り対応・提案を見るため
    'アポ獲得/興味あり': 3,  // 成功パターンを見るため
  };
  
  // まず指定結果から
  for (const [result, max] of Object.entries(quota)) {
    const available = byResult[result] || [];
    for (let i = 0; i < Math.min(max, available.length); i++) {
      samples.push(available[i]);
    }
  }
  
  // 残りの結果からも取得（合計18件まで）
  for (const [result, cs] of Object.entries(byResult)) {
    if (result in quota) continue;
    for (let i = 0; i < Math.min(2, cs.length) && samples.length < 18; i++) {
      samples.push(cs[i]);
    }
  }
  
  const outFile = path.join(__dirname, `detail-${member}.txt`);
  let out = `=== ${DISPLAY[member]} (全${convs.length}件中${samples.length}件抽出) ===\n`;
  out += `結果分布: ${Object.entries(byResult).map(([k,v]) => `${k}:${v.length}`).join(' / ')}\n\n`;
  
  for (const c of samples) {
    out += `--- [${c.result}] ${c.dateLocal} / ${c.turns}ターン ---\n`;
    // 全ターンを出力（会話の流れを追うため）
    out += `会話:\n`;
    for (const t of c.conversation) {
      out += `  ${t.role}: ${t.text}\n`;
    }
    out += `\n`;
  }
  
  fs.writeFileSync(outFile, out, 'utf-8');
  const size = Math.round(fs.statSync(outFile).size / 1024);
  console.log(`${DISPLAY[member]}: ${samples.length}件 (${size}KB)`);
}
