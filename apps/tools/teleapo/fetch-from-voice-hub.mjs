/**
 * soct-voice-hub エクスポートAPIからデータを取得し、JSONに保存する
 * 
 * ページネーション対応で全件を自動取得する。
 * transcript付き/なしの両方のファイルを生成する。
 * 
 * 使い方:
 *   node --env-file=.env fetch-from-voice-hub.mjs [from] [to]
 *   node --env-file=.env fetch-from-voice-hub.mjs 2026-04-01 2026-04-17
 */

const API_URL = process.env.VOICE_HUB_API_URL
const API_KEY = process.env.EXPORT_API_KEY

if (!API_URL || !API_KEY) {
  console.error('❌ 環境変数 VOICE_HUB_API_URL, EXPORT_API_KEY が必要です')
  process.exit(1)
}

// コマンドライン引数から期間を取得
const from = process.argv[2] || '2026-04-01'
const to = process.argv[3] || '2026-04-17'

console.log(`📡 soct-voice-hub API からデータ取得中...`)
console.log(`   期間: ${from} 〜 ${to}`)
console.log(`   API: ${API_URL}`)
console.log()

/**
 * ページネーションで全件取得する
 */
async function fetchAllCalls(includeTranscript = true) {
  const allData = []
  let cursor = undefined
  let page = 1
  let total = 0

  while (true) {
    const params = new URLSearchParams({
      from,
      to,
      limit: '200',
      include_transcript: String(includeTranscript),
    })
    if (cursor) params.set('cursor', cursor)

    const url = `${API_URL}?${params.toString()}`
    console.log(`   ページ ${page}: 取得中...`)

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`API エラー ${res.status}: ${text}`)
    }

    const json = await res.json()
    total = json.meta.total
    allData.push(...json.data)
    console.log(`   ページ ${page}: ${json.data.length}件取得 (累計 ${allData.length}/${total})`)

    if (!json.meta.next_cursor) break
    cursor = json.meta.next_cursor
    page++
  }

  return { data: allData, total }
}

// 1. transcript なしで軽量データ取得（メタデータ + insights のみ）
console.log('📊 Step 1: メタデータ取得（transcript なし）')
const metaResult = await fetchAllCalls(false)
const metaFilename = `calls-meta-${from}-${to}.json`
const { writeFile } = await import('node:fs/promises')
await writeFile(metaFilename, JSON.stringify(metaResult, null, 2))
console.log(`   ✅ ${metaFilename} に保存 (${metaResult.data.length}件)`)
console.log()

// 2. transcript 付きで全件取得
console.log('📝 Step 2: 全文データ取得（transcript 付き）')
const fullResult = await fetchAllCalls(true)
const fullFilename = `calls-full-${from}-${to}.json`
await writeFile(fullFilename, JSON.stringify(fullResult, null, 2))
console.log(`   ✅ ${fullFilename} に保存 (${fullResult.data.length}件)`)
console.log()

// 3. 基本統計を表示
const data = metaResult.data
const members = {}
const outcomes = {}
let totalDuration = 0

for (const call of data) {
  // メンバー集計
  const name = call.user_name || '不明'
  if (!members[name]) members[name] = { count: 0, totalDuration: 0, outcomes: {} }
  members[name].count++
  members[name].totalDuration += call.duration

  // outcome 集計
  const oc = call.outcome || 'unknown'
  outcomes[oc] = (outcomes[oc] || 0) + 1
  if (!members[name].outcomes[oc]) members[name].outcomes[oc] = 0
  members[name].outcomes[oc]++

  totalDuration += call.duration
}

console.log('='.repeat(60))
console.log('📈 基本統計')
console.log('='.repeat(60))
console.log(`全通話件数: ${data.length}`)
console.log(`合計通話時間: ${Math.round(totalDuration / 60)}分 (${Math.round(totalDuration / 3600 * 10) / 10}時間)`)
console.log(`平均通話時間: ${Math.round(totalDuration / data.length)}秒`)
console.log()

console.log('--- outcome 分布 ---')
for (const [oc, count] of Object.entries(outcomes).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${oc}: ${count}件 (${(count / data.length * 100).toFixed(1)}%)`)
}
console.log()

console.log('--- メンバー別 ---')
for (const [name, m] of Object.entries(members).sort((a, b) => b[1].count - a[1].count)) {
  const avgDur = Math.round(m.totalDuration / m.count)
  const appt = m.outcomes.appointment_set || 0
  console.log(`  ${name}: ${m.count}件, 平均${avgDur}秒, アポ${appt}件`)
}

console.log()
console.log('✅ データ取得完了')
