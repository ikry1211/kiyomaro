#!/usr/bin/env node
/**
 * テレアポ通話ログ取得スクリプト
 * Slack APIから全メッセージを取得し、ローデータ + パース済み会話データを保存する。
 *
 * 出力:
 *   raw-messages-YYYYMMDD.json   … Slack APIの生レスポンス全件
 *   conversations-YYYYMMDD.json  … パース済み会話データ全件（会話内容・感情推定含む）
 *   summary-YYYYMMDD.json        … AGENT別・日別の集計データ
 */

const fs = require('fs');
const path = require('path');

const SLACK_TOKEN = 'REDACTED_SLACK_TOKEN';
const CHANNEL_ID = 'C09G8TUN4KU'; // 00_connect_rakuco-sales
const DAYS_BACK = 7;
const OUT_DIR = path.join(__dirname);

const now = Math.floor(Date.now() / 1000);
const oldest = now - (DAYS_BACK * 24 * 60 * 60);
const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// ── AGENT名正規化 ──
function normalizeAgentName(rawName) {
  if (!rawName) return '不明';
  const n = rawName.trim();
  if (/カギタニ|カギ谷|鍵谷/.test(n)) return '鍵谷';
  if (/フクダ|福田/.test(n)) return '福田';
  if (/ノジマ|オノジマ|野島/.test(n)) return '野島';
  if (/ヒダカ|日高/.test(n)) return '日高';
  if (/フジモト|フ、フジモト|フジモトモト/.test(n)) return 'フジモト';
  if (/イシマ|イシマル|石丸|イシマズ/.test(n)) return '石丸';
  if (/カワカミ/.test(n)) return 'カワカミ';
  if (/エージェント/.test(n)) return '不明';
  if (n.length > 10) return '不明';
  return n;
}

// ── Slack API取得（ページネーション） ──
async function fetchAllMessages() {
  let allMessages = [];
  let cursor = undefined;
  let page = 0;

  console.log(`📡 ${DAYS_BACK}日分のメッセージを取得中...`);
  while (true) {
    page++;
    const params = new URLSearchParams({
      channel: CHANNEL_ID, oldest: oldest.toString(),
      latest: now.toString(), limit: '200', inclusive: 'true',
    });
    if (cursor) params.append('cursor', cursor);
    const res = await fetch(`https://slack.com/api/conversations.history?${params}`, {
      headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` },
    });
    const data = await res.json();
    if (!data.ok) { console.error('API Error:', data.error); process.exit(1); }
    allMessages = allMessages.concat(data.messages || []);
    console.log(`  Page ${page}: ${allMessages.length}件`);
    if (data.has_more && data.response_metadata?.next_cursor) {
      cursor = data.response_metadata.next_cursor;
    } else break;
  }
  console.log(`✅ 取得完了: ${allMessages.length}件\n`);
  return allMessages;
}

// ── AGENT名抽出 ──
function extractAgentName(text) {
  const patterns = [
    /AGENT[:：].*?(?:株式会社|㈱)\s*(?:ソクト|ソフト|SOCT|ソクトウ|サクト|ソト)\s*の\s*(\S+?)(?:と申|です|で|ヒと|から)/,
    /(?:私|わたし)[、,]?\s*(?:株式会社|㈱)?\s*(?:ソクト|ソフト|SOCT)\s*の\s*(\S+?)(?:と申|です|で)/,
    /AGENT[:：].*?(?:ソクト|ソフト|SOCT|サクト|ソト)の(\S+?)(?:と申|です|で|から)/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return normalizeAgentName(m[1]);
  }
  return '不明';
}

// ── 感情推定パース ──
function parseSentiment(text, label) {
  const re = new RegExp(label + ' 感情推定\\s*```([\\s\\S]*?)```');
  const m = text.match(re);
  if (!m) return null;
  const result = {};
  for (const line of m[1].split('\n').filter(l => l.trim())) {
    const s = line.match(/^(POSITIVE|NEGATIVE|NEUTRAL|MIXED)[:：]\s*([\d.]+)/);
    if (s) result[s[1]] = parseFloat(s[2]);
  }
  return Object.keys(result).length > 0 ? result : null;
}

// ── 通話結果分類 ──
function classifyResult(text) {
  if (text.includes('電話に出ることができません') || text.includes('留守番電話') ||
      text.includes('ピーという')) return '留守電・自動応答';
  if (text.includes('迷惑電話防止') && !text.includes('AGENT:')) return '自動ガイダンス';
  if (text.includes('ファクシミリ')) return 'FAX転送';
  if (text.includes('導入しちゃって') || text.includes('もう入れて') ||
      (text.includes('使ってる') && !text.includes('名前を使って')) ||
      text.includes('他のシステム') || text.includes('他のソフト') ||
      text.includes('介護ソフト') || text.includes('介護、ソフト')) return '他システム導入済み';
  if (text.includes('間に合って') || text.includes('大丈夫です') ||
      text.includes('結構です') || text.includes('要らない') ||
      text.includes('お断り')) return '不要（断り）';
  if (text.includes('不在') || text.includes('おりません') || text.includes('おらん') ||
      text.includes('席を空けて') || text.includes('お休み') ||
      text.includes('忙しい')) return '担当者不在';
  if (text.includes('改め') || text.includes('来週また') ||
      text.includes('またお電話')) return '再架電予定';
  if (text.includes('Zoom') || text.includes('zoom') || text.includes('デモ') ||
      text.includes('ご紹介') || text.includes('ご説明させて') ||
      text.includes('資料') || text.includes('お時間いただ')) return 'アポ獲得/興味あり';
  if (text.includes('自分でやってる') || text.includes('やっております')) return '自社対応済み';
  if (text.includes('問題はない') || text.includes('問題ない')) return '既存満足（断り）';
  return 'その他';
}

// ── 会話内容を抽出 ──
function extractConversation(text) {
  const convMatch = text.match(/会話内容\s*\/\s*感情推定\s*```([\s\S]*?)```/);
  if (!convMatch) return [];
  return convMatch[1].split('\n').filter(l => l.trim()).map(line => {
    const m = line.match(/^(CUSTOMER|AGENT)[:：](.*?)[:：](POSITIVE|NEGATIVE|NEUTRAL|MIXED)\s*$/);
    if (m) return { role: m[1], text: m[2].trim(), sentiment: m[3] };
    return null;
  }).filter(Boolean);
}

// ── 切り返しパターン分析 ──
function analyzeRejectionHandling(conv) {
  const patterns = [];
  for (let i = 0; i < conv.length - 1; i++) {
    if (conv[i].role === 'CUSTOMER' && conv[i + 1].role === 'AGENT') {
      const custText = conv[i].text;
      const agentText = conv[i + 1].text;
      if (custText.includes('使ってる') || custText.includes('大丈夫') ||
          custText.includes('間に合って') || custText.includes('導入') ||
          custText.includes('結構') || custText.includes('要らない')) {
        if (agentText.includes('かしこまりました') || agentText.includes('分かりました') ||
            agentText.includes('ありがとうございます')) patterns.push('即引き下がり');
        else if (agentText.includes('料金') || agentText.includes('値段') ||
                 agentText.includes('お安い') || agentText.includes('無料')) patterns.push('料金訴求');
        else if (agentText.includes('お困り') || agentText.includes('問題') ||
                 agentText.includes('使用感') || agentText.includes('不安')) patterns.push('課題ヒアリング');
        else if (agentText.includes('比較') || agentText.includes('見て')) patterns.push('比較提案');
        else patterns.push('その他の対応');
      }
    }
  }
  return patterns;
}

// ── 商品説明分析 ──
function analyzeProductExplanation(conv) {
  const agentLines = conv.filter(c => c.role === 'AGENT').map(c => c.text);
  const fullText = agentLines.join(' ');
  let depth = 'なし';
  if (fullText.includes('請求ミス') || fullText.includes('後日指導') ||
      fullText.includes('不安が解消') || fullText.includes('お声をいただ') ||
      fullText.includes('支援記録') || fullText.includes('勤怠')) depth = '課題解決型';
  else if (fullText.includes('ラクコ') || fullText.includes('楽') ||
           fullText.includes('ココホレ') || fullText.includes('ココ保連')) depth = 'サービス名言及';
  else if (fullText.includes('請求システム') || fullText.includes('国保連') ||
           fullText.includes('ここの請求')) depth = 'カテゴリのみ';
  return {
    depth,
    mentionsPrice: fullText.includes('料金') || fullText.includes('値段') || fullText.includes('無料') || fullText.includes('お安い'),
    mentionsFeature: fullText.includes('支援記録') || fullText.includes('勤怠') || fullText.includes('請求ミス'),
    mentionsCaseStudy: fullText.includes('お声') || fullText.includes('事例') || fullText.includes('解消された'),
    agentTurns: agentLines.length,
    avgLength: agentLines.length > 0 ? Math.round(agentLines.reduce((a, b) => a + b.length, 0) / agentLines.length) : 0,
  };
}

// ── メイン ──
async function main() {
  const messages = await fetchAllMessages();

  // 1. ローデータ保存
  const rawFile = path.join(OUT_DIR, `raw-messages-${dateTag}.json`);
  fs.writeFileSync(rawFile, JSON.stringify(messages, null, 2), 'utf-8');
  console.log(`💾 ローデータ保存: ${rawFile} (${messages.length}件)`);

  // 2. 会話パース
  const conversations = [];
  for (const msg of messages) {
    if (msg.subtype !== 'bot_message') continue;
    const text = msg.text || '';
    const contactMatch = text.match(/コンタクトID[:：]\s*([a-f0-9-]+)/);
    if (!contactMatch) continue;
    if (!text.includes('要約') || !text.includes('会話内容')) continue;

    const ts = parseFloat(msg.ts);
    const date = new Date(ts * 1000);
    const conv = extractConversation(text);

    conversations.push({
      contactId: contactMatch[1],
      timestamp: msg.ts,
      date: date.toISOString(),
      dateLocal: date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      dateKey: date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      agentName: extractAgentName(text),
      result: classifyResult(text),
      summary: (text.match(/要約[:：]([\s\S]*?)(?=会話内容)/) || [])[1]?.trim() || null,
      conversation: conv,
      rejectionHandling: analyzeRejectionHandling(conv),
      productExplanation: analyzeProductExplanation(conv),
      agentSentiment: parseSentiment(text, 'AGENT'),
      customerSentiment: parseSentiment(text, 'CUSTOMER'),
      turns: conv.length,
      rawText: text, // 元テキスト全文も保持
    });
  }

  const convFile = path.join(OUT_DIR, `conversations-${dateTag}.json`);
  fs.writeFileSync(convFile, JSON.stringify(conversations, null, 2), 'utf-8');
  console.log(`💾 会話データ保存: ${convFile} (${conversations.length}件)`);

  // 3. サマリー（集計）
  // ... 省略（既存のレポートで十分なため、ローデータ優先で保存）

  console.log(`\n✅ 完了。以下のファイルが生成されました:`);
  console.log(`   ${rawFile}`);
  console.log(`   ${convFile}`);
}

main();
