#!/usr/bin/env node
// ============================================================
// Slack チャンネル分類スクリプト v3
//
// 設計方針（公式API仕様に基づく）:
//   1. conversations.list?exclude_archived=true で非アーカイブのみ取得
//   2. conversations.history?limit=20 で最新20件取得（oldest/latest不使用）
//   3. クライアント側でタイムスタンプ判定・メッセージ分類
//   4. レート制限を尊重（Tier 3: 50+/分 → 1.5秒間隔）
//   5. エラー時はリトライ（最大3回、指数バックオフ）
//   6. 失敗チャンネルを明示的に報告
//
// 使い方:
//   node apps/tools/classify-slack-channels.js
//   node apps/tools/classify-slack-channels.js --days 60
//   node apps/tools/classify-slack-channels.js --format json
// ============================================================

const TOKEN = process.env.SLACK_USER_TOKEN;
if (!TOKEN) {
  console.error('❌ 環境変数 SLACK_USER_TOKEN が設定されていません');
  process.exit(1);
}

// --- 設定 ---
const args = process.argv.slice(2);
const DAYS = parseInt(getArg('--days') || '30');
const FORMAT = getArg('--format') || 'table'; // table | json
const SAMPLE_SIZE = 3;
const HISTORY_LIMIT = 20;        // 1チャンネルあたりの取得件数
const API_INTERVAL_MS = 1500;    // API呼び出し間隔（Tier 3: 50+/分に収まる）
const MAX_RETRIES = 3;

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

// 入退出・システムメッセージのsubtype一覧
const SYSTEM_SUBTYPES = new Set([
  'channel_join', 'channel_leave', 'channel_purpose',
  'channel_topic', 'channel_name', 'channel_archive',
  'channel_unarchive', 'group_join', 'group_leave',
  'group_purpose', 'group_topic', 'group_name',
  'tombstone', 'ekm_access_denied',
  'pinned_item', 'unpinned_item',
]);

// --- API呼び出し（リトライ・レート制限対応） ---
async function api(method, params = {}) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = new URL(`https://slack.com/api/${method}`);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });

      // レスポンスヘッダーからレート制限情報を取得（初回のみログ）
      if (attempt === 1 && method === 'conversations.history') {
        const retryAfter = res.headers.get('retry-after');
        if (retryAfter) {
          const waitMs = parseInt(retryAfter) * 1000;
          console.error(`  ⏳ レート制限検出: ${retryAfter}秒待機`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;  // レート制限後リトライ
        }
      }

      const data = await res.json();

      if (!data.ok) {
        if (data.error === 'ratelimited') {
          const waitMs = (attempt * 3) * 1000;
          console.error(`  ⏳ レート制限 (${method}): ${waitMs}ms待機後リトライ [${attempt}/${MAX_RETRIES}]`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        // レート制限以外のエラーはそのまま返す
        return data;
      }

      return data;
    } catch (err) {
      console.error(`  ⚠️ ネットワークエラー (${method}) [${attempt}/${MAX_RETRIES}]: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
  }
  return { ok: false, error: 'max_retries_exceeded' };
}

// --- Step 1: チャンネル一覧取得（アーカイブ除外） ---
async function getActiveChannels() {
  let all = [];
  let cursor = '';
  let page = 0;
  do {
    page++;
    const params = {
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '200',
    };
    if (cursor) params.cursor = cursor;
    const data = await api('conversations.list', params);
    if (!data.ok) {
      console.error(`❌ conversations.list エラー (page ${page}): ${data.error}`);
      break;
    }
    all = all.concat(data.channels);
    cursor = data.response_metadata?.next_cursor || '';
    console.log(`  📂 conversations.list page ${page}: ${data.channels.length}ch`);
  } while (cursor);
  return all;
}

// --- Step 2: メッセージ分類 ---
function classifyMessages(messages, cutoffTs) {
  let humanCount = 0;
  let botCount = 0;
  let systemCount = 0;
  const humanSamples = [];

  for (const m of messages) {
    const ts = parseFloat(m.ts);
    // cutoff以前のメッセージはスキップ
    if (ts < cutoffTs) continue;

    const subtype = m.subtype || '';
    if (SYSTEM_SUBTYPES.has(subtype)) {
      systemCount++;
    } else if (m.bot_id || subtype === 'bot_message') {
      botCount++;
    } else {
      humanCount++;
      if (humanSamples.length < SAMPLE_SIZE) {
        const text = (m.text || '').replace(/<[^>]+>/g, '').trim();
        if (text) humanSamples.push(text.substring(0, 120));
      }
    }
  }

  return { humanCount, botCount, systemCount, humanSamples };
}

// --- アクティブ度判定 ---
function getActivityLevel(humanCount) {
  if (humanCount >= 15) return { level: '🔥高', sort: 4 };
  if (humanCount >= 5)  return { level: '🟢中', sort: 3 };
  if (humanCount >= 1)  return { level: '🟡低', sort: 2 };
  return { level: '⚪無', sort: 0 };
}

// --- メイン ---
async function main() {
  const now = Math.floor(Date.now() / 1000);
  const cutoffTs = now - (DAYS * 24 * 60 * 60);
  const cutoffDate = new Date(cutoffTs * 1000).toISOString().split('T')[0];

  console.log(`📡 Slack チャンネル分類 v3`);
  console.log(`   期間: 直近${DAYS}日間（${cutoffDate}以降）`);
  console.log(`   取得件数: 最新${HISTORY_LIMIT}件/ch`);
  console.log(`   API間隔: ${API_INTERVAL_MS}ms`);
  console.log('');

  // Step 1: チャンネル一覧（アーカイブ除外）
  const channels = await getActiveChannels();
  const targets = channels.filter(ch => ch.is_member);
  console.log(`\n📂 非アーカイブ: ${channels.length}ch → 参加中: ${targets.length}ch\n`);

  // Step 2: 各チャンネルのメッセージ取得
  const results = [];
  const failures = [];

  for (let i = 0; i < targets.length; i++) {
    const ch = targets[i];
    process.stdout.write(`  [${i + 1}/${targets.length}] ${ch.name}...`);

    const data = await api('conversations.history', {
      channel: ch.id,
      limit: HISTORY_LIMIT,
    });

    if (!data.ok) {
      console.log(` ❌ ${data.error}`);
      failures.push({ name: ch.name, id: ch.id, error: data.error });
    } else {
      const messages = data.messages || [];
      const stats = classifyMessages(messages, cutoffTs);
      const activity = getActivityLevel(stats.humanCount);

      results.push({
        name: ch.name,
        id: ch.id,
        private: ch.is_private,
        members: ch.num_members,
        ...stats,
        ...activity,
      });

      console.log(` ${activity.level} 人${stats.humanCount}/Bot${stats.botCount}/Sys${stats.systemCount}`);
    }

    // 最後のリクエスト以外は間隔を空ける
    if (i < targets.length - 1) {
      await new Promise(r => setTimeout(r, API_INTERVAL_MS));
    }
  }

  // Step 3: 出力
  results.sort((a, b) => b.humanCount - a.humanCount || b.botCount - a.botCount);

  if (FORMAT === 'json') {
    console.log(JSON.stringify({ results, failures, meta: { days: DAYS, cutoff: cutoffDate, scanned: targets.length } }, null, 2));
    return;
  }

  const active = results.filter(r => r.humanCount > 0);
  const botOnly = results.filter(r => r.humanCount === 0 && r.botCount > 0);
  const dormant = results.filter(r => r.humanCount === 0 && r.botCount === 0);

  console.log('\n' + '='.repeat(90));
  console.log(`📊 分類結果（直近${DAYS}日 / 入退出除外 / limit=${HISTORY_LIMIT}）`);
  console.log('='.repeat(90));

  console.log(`\n### 👤 人間の会話あり: ${active.length}ch\n`);
  console.log('Level | 人間 | Bot  | チャンネル名');
  console.log('-'.repeat(90));
  for (const r of active) {
    const lock = r.private ? '🔒' : '📢';
    console.log(`${r.level}  | ${String(r.humanCount).padStart(4)} | ${String(r.botCount).padStart(4)} | ${lock} ${r.name} (${r.members ?? '?'}名) | ${r.id}`);
    for (const s of r.humanSamples) {
      console.log(`      |      |      | 💬 "${s.substring(0, 80)}"`);
    }
  }

  console.log(`\n### 🤖 Bot通知のみ: ${botOnly.length}ch\n`);
  for (const r of botOnly) {
    const lock = r.private ? '🔒' : '📢';
    console.log(`🤖    |    0 | ${String(r.botCount).padStart(4)} | ${lock} ${r.name} (${r.members ?? '?'}名) | ${r.id}`);
  }

  console.log(`\n### ⚪ 最新${HISTORY_LIMIT}件が全て${DAYS}日以前: ${dormant.length}ch`);
  if (dormant.length > 0) {
    console.log('  ' + dormant.map(r => r.name).join(', '));
  }

  if (failures.length > 0) {
    console.log(`\n### ❌ データ取得失敗: ${failures.length}ch`);
    for (const f of failures) {
      console.log(`  ${f.name} (${f.id}): ${f.error}`);
    }
  }

  // サマリ
  console.log('\n' + '='.repeat(90));
  console.log('📋 サマリ');
  console.log(`  🔥高（15件+）: ${results.filter(r => r.sort === 4).length}ch`);
  console.log(`  🟢中（5-14件）: ${results.filter(r => r.sort === 3).length}ch`);
  console.log(`  🟡低（1-4件）: ${results.filter(r => r.sort === 2).length}ch`);
  console.log(`  🤖Botのみ: ${botOnly.length}ch`);
  console.log(`  ⚪休眠: ${dormant.length}ch`);
  if (failures.length > 0) {
    console.log(`  ❌失敗: ${failures.length}ch ← 結果に含まれていません`);
  } else {
    console.log(`  ✅ 全${targets.length}chのデータ取得成功`);
  }
}

main().catch(console.error);
