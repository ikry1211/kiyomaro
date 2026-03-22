#!/usr/bin/env node
/**
 * テレアポ会話内容の詳細分析スクリプト
 * conversations-20260320.json を読み込み、メンバー別の会話パターンを深掘り分析する。
 */
const fs = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, 'conversations-20260320.json');
const conversations = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

// ── 分析対象メンバー ──
const TARGET_MEMBERS = ['鍵谷', '福田', '野島', '日高', 'フジモト', '石丸'];

// ── メンバー別にグループ化 ──
const byAgent = {};
for (const c of conversations) {
  if (!TARGET_MEMBERS.includes(c.agentName)) continue;
  if (!byAgent[c.agentName]) byAgent[c.agentName] = [];
  byAgent[c.agentName].push(c);
}

// ── 1. オープニングトーク分析 ──
function analyzeOpening(convs) {
  const patterns = { '挨拶+自己紹介+用件': 0, '自己紹介+用件': 0, '用件のみ': 0, 'その他': 0 };
  const openingExamples = [];

  for (const c of convs) {
    const agentFirst = c.conversation.find(t => t.role === 'AGENT');
    if (!agentFirst) continue;
    const txt = agentFirst.text;

    if ((txt.includes('お世話になっております') || txt.includes('お世話になります')) && txt.includes('と申')) {
      patterns['挨拶+自己紹介+用件']++;
    } else if (txt.includes('と申') || txt.includes('と申します')) {
      patterns['自己紹介+用件']++;
    } else if (txt.includes('請求') || txt.includes('システム')) {
      patterns['用件のみ']++;
    } else {
      patterns['その他']++;
    }

    if (openingExamples.length < 3) {
      openingExamples.push(txt.substring(0, 120));
    }
  }
  return { patterns, openingExamples };
}

// ── 2. 会話の深さ分析 ──
function analyzeDepth(convs) {
  const depths = { short: 0, medium: 0, long: 0 }; // <10, 10-25, 25+
  let totalAgentWords = 0;
  let totalAgentTurns = 0;
  let maxTurns = 0;
  let longestConv = null;

  for (const c of convs) {
    const turns = c.turns;
    if (turns < 10) depths.short++;
    else if (turns < 25) depths.medium++;
    else depths.long++;

    const agentTexts = c.conversation.filter(t => t.role === 'AGENT');
    totalAgentTurns += agentTexts.length;
    totalAgentWords += agentTexts.reduce((sum, t) => sum + t.text.length, 0);

    if (turns > maxTurns) { maxTurns = turns; longestConv = c; }
  }

  return {
    depths,
    avgAgentTurns: convs.length > 0 ? Math.round(totalAgentTurns / convs.length * 10) / 10 : 0,
    avgAgentWordsPerTurn: totalAgentTurns > 0 ? Math.round(totalAgentWords / totalAgentTurns) : 0,
    maxTurns,
    longestConvId: longestConv?.contactId,
  };
}

// ── 3. 断り対応の詳細分析 ──
function analyzeRejectionDetail(convs) {
  const rejections = [];

  for (const c of convs) {
    for (let i = 0; i < c.conversation.length - 1; i++) {
      const cust = c.conversation[i];
      const agent = c.conversation[i + 1];
      if (cust.role !== 'CUSTOMER' || agent.role !== 'AGENT') continue;

      // 断りフレーズの検出
      const isRejection =
        cust.text.includes('使ってる') || cust.text.includes('使っている') ||
        cust.text.includes('大丈夫') || cust.text.includes('間に合って') ||
        cust.text.includes('導入') || cust.text.includes('結構') ||
        cust.text.includes('要らない') || cust.text.includes('入れて') ||
        cust.text.includes('他の') || cust.text.includes('必要ない');

      if (isRejection) {
        rejections.push({
          contactId: c.contactId,
          customerSays: cust.text,
          agentResponds: agent.text,
          // さらに次のやりとりがあるか（粘ったか）
          continuesAfter: i + 2 < c.conversation.length &&
            c.conversation.slice(i + 2).some(t => t.role === 'AGENT'),
          result: c.result,
        });
      }
    }
  }

  // 切り返し後に会話が続いたか
  const continued = rejections.filter(r => r.continuesAfter).length;
  return {
    total: rejections.length,
    continuedAfterRejection: continued,
    continuedRate: rejections.length > 0 ? Math.round(continued / rejections.length * 100) : 0,
    examples: rejections.slice(0, 5).map(r => ({
      customer: r.customerSays.substring(0, 80),
      agent: r.agentResponds.substring(0, 120),
      continued: r.continuesAfter,
      result: r.result,
    })),
  };
}

// ── 4. アポ獲得通話の詳細分析 ──
function analyzeSuccesses(convs) {
  const apoCalls = convs.filter(c => c.result === 'アポ獲得/興味あり');
  return apoCalls.map(c => ({
    contactId: c.contactId,
    date: c.dateLocal,
    turns: c.turns,
    summary: c.summary?.substring(0, 200),
    // AGENT発言を全て抽出
    agentStatements: c.conversation
      .filter(t => t.role === 'AGENT')
      .map(t => t.text),
    customerSentiment: c.customerSentiment,
    agentSentiment: c.agentSentiment,
  }));
}

// ── 5. 質問力分析（AGENT発言に?が含まれるか） ──
function analyzeQuestions(convs) {
  let totalQuestions = 0;
  let qualifyingQuestions = 0; // 相手の状況を聞く質問
  let closingQuestions = 0;   // アポクロージング系質問
  const questionExamples = [];

  for (const c of convs) {
    for (const t of c.conversation) {
      if (t.role !== 'AGENT') continue;
      const hasQ = t.text.includes('?') || t.text.includes('？') ||
                   t.text.includes('でしょうか') || t.text.includes('ですかね') ||
                   t.text.includes('ですか') || t.text.includes('ますか');
      if (!hasQ) continue;
      totalQuestions++;

      if (t.text.includes('担当') || t.text.includes('お手すき') ||
          t.text.includes('いらっしゃい')) {
        qualifyingQuestions++;
      } else if (t.text.includes('お時間') || t.text.includes('ご都合') ||
                 t.text.includes('月曜') || t.text.includes('来週') ||
                 t.text.includes('空いて')) {
        closingQuestions++;
      }

      if (questionExamples.length < 5 && !t.text.includes('お手すき')) {
        questionExamples.push(t.text.substring(0, 100));
      }
    }
  }

  return {
    totalQuestions,
    questionsPerCall: convs.length > 0 ? Math.round(totalQuestions / convs.length * 10) / 10 : 0,
    qualifyingQuestions,
    closingQuestions,
    otherQuestions: totalQuestions - qualifyingQuestions - closingQuestions,
    examples: questionExamples,
  };
}

// ── 6. 感情ダイナミクス ──
function analyzeSentimentFlow(convs) {
  // 会話の前半 vs 後半でCUSTOMER感情がどう変わるか
  let improvedCount = 0;
  let worsenedCount = 0;
  let unchangedCount = 0;

  for (const c of convs) {
    const custLines = c.conversation.filter(t => t.role === 'CUSTOMER' && t.sentiment);
    if (custLines.length < 4) continue;

    const mid = Math.floor(custLines.length / 2);
    const firstHalf = custLines.slice(0, mid);
    const secondHalf = custLines.slice(mid);

    const score = (lines) => {
      const pos = lines.filter(l => l.sentiment === 'POSITIVE').length;
      const neg = lines.filter(l => l.sentiment === 'NEGATIVE').length;
      return (pos - neg) / lines.length;
    };

    const diff = score(secondHalf) - score(firstHalf);
    if (diff > 0.05) improvedCount++;
    else if (diff < -0.05) worsenedCount++;
    else unchangedCount++;
  }

  return {
    improved: improvedCount,
    worsened: worsenedCount,
    unchanged: unchangedCount,
    total: improvedCount + worsenedCount + unchangedCount,
  };
}

// ── メイン集計 ──
const report = {};
for (const [name, convs] of Object.entries(byAgent)) {
  const results = {};
  for (const c of convs) {
    results[c.result] = (results[c.result] || 0) + 1;
  }

  report[name] = {
    totalCalls: convs.length,
    results,
    apoCount: results['アポ獲得/興味あり'] || 0,
    apoRate: convs.length > 0 ? Math.round(((results['アポ獲得/興味あり'] || 0) / convs.length) * 1000) / 10 : 0,
    opening: analyzeOpening(convs),
    depth: analyzeDepth(convs),
    rejection: analyzeRejectionDetail(convs),
    successes: analyzeSuccesses(convs),
    questions: analyzeQuestions(convs),
    sentimentFlow: analyzeSentimentFlow(convs),
  };
}

// ── 出力 ──
const outputFile = path.join(__dirname, 'detailed-analysis-20260320.json');
fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf-8');
console.log(JSON.stringify(report, null, 2));
console.error(`\n💾 ${outputFile} に保存しました`);
