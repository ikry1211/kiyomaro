/**
 * テレアポ通話 定量分析スクリプト
 * 
 * calls-full-*.json からtranscriptを解析し、
 * 前回（3月）と同等の指標を算出する。
 * 
 * 使い方:
 *   node analyze-quantitative.mjs calls-full-2026-04-01-2026-04-17.json
 */
import { readFile, writeFile } from 'node:fs/promises'

// 石丸さん（商談担当）を除外するためのフィルタ
const EXCLUDE_EMAILS = ['kana.ishimaru@rakuco.jp']

const inputFile = process.argv[2] || 'calls-full-2026-04-01-2026-04-17.json'

console.log(`📊 定量分析開始: ${inputFile}`)
console.log()

const raw = JSON.parse(await readFile(inputFile, 'utf-8'))
const allCalls = raw.data || raw

// テレアポ担当のみフィルタ
const calls = allCalls.filter(c => !EXCLUDE_EMAILS.includes(c.user_email))
console.log(`全件数: ${allCalls.length} → テレアポ担当のみ: ${calls.length}件`)
console.log()

// ===== ユーティリティ関数 =====

/** transcriptを自社/相手先の発話に分割 */
function parseTranscript(transcript) {
  if (!transcript) return { selfUtterances: [], otherUtterances: [], turns: 0 }
  
  const lines = transcript.split('\n').filter(l => l.trim())
  const selfUtterances = []
  const otherUtterances = []
  
  for (const line of lines) {
    if (line.startsWith('自社:') || line.startsWith('自社：')) {
      selfUtterances.push(line.replace(/^自社[:：]\s*/, ''))
    } else if (line.startsWith('相手先:') || line.startsWith('相手先：')) {
      otherUtterances.push(line.replace(/^相手先[:：]\s*/, ''))
    }
  }
  
  return {
    selfUtterances,
    otherUtterances,
    turns: selfUtterances.length + otherUtterances.length,
  }
}

/** 質問フレーズのカウント */
function countQuestions(utterances) {
  const questionPatterns = [/？/, /\?/, /ですか/, /ますか/, /でしょうか/, /ございますか/, /いかがでしょう/, /よろしいでしょう/]
  let count = 0
  for (const u of utterances) {
    if (questionPatterns.some(p => p.test(u))) count++
  }
  return count
}

/** 担当者確認（定型質問）のカウント */
function countGatekeeperQuestions(utterances) {
  const patterns = [/いらっしゃい/, /お繋ぎ/, /おつなぎ/, /取り次/, /とりつ/, /担当の方/, /担当者/, /ご担当/, /代わって/, /お変わり/]
  let count = 0
  for (const u of utterances) {
    if (patterns.some(p => p.test(u))) count++
  }
  return count
}

/** 断りフレーズの検出 */
function isRefusal(utterance) {
  const patterns = [
    /結構です/, /間に合って/, /必要ない/, /いらない/, /いりません/, /お断り/,
    /興味ない/, /興味ありません/, /今はちょっと/, /けっこう/, /大丈夫です/,
    /お気持ちだけ/, /遠慮/, /差し控え/, /切らせて/, /ガチャ/,
  ]
  return patterns.some(p => p.test(utterance))
}

/** 断り後の継続率 */
function calcRefusalContinuation(selfUtterances, otherUtterances) {
  let refusalCount = 0
  let continuedCount = 0
  
  // 相手先の発話をインデックスで追跡
  const allLines = []
  let si = 0, oi = 0
  // 簡易的にtranscript全体の流れを再構築
  // 相手先の断り後に自社の発話が続くかを確認
  for (let i = 0; i < otherUtterances.length; i++) {
    if (isRefusal(otherUtterances[i])) {
      refusalCount++
      // 断り後にまだ自社の発話がある場合
      if (i < selfUtterances.length - 1) {
        continuedCount++
      }
    }
  }
  
  return { refusalCount, continuedCount, rate: refusalCount > 0 ? continuedCount / refusalCount : 0 }
}

/** クロージング関連の質問 */
function countClosingQuestions(utterances) {
  const patterns = [
    /何日/, /何時/, /日程/, /いつ/, /ご都合/, /スケジュール/, /予定/,
    /お時間/, /〜時/, /\d+時/, /\d+日/, /来週/, /再来週/, /今週/,
    /月曜/, /火曜/, /水曜/, /木曜/, /金曜/, /午前/, /午後/,
    /Zoom/, /zoom/, /オンライン/, /デモ/, /ご案内/,
  ]
  let count = 0
  for (const u of utterances) {
    if (patterns.some(p => p.test(u))) count++
  }
  return count
}

/** センチメント推移の分析 */
function analyzeSentimentTrajectory(timeline) {
  if (!timeline || timeline.length < 2) return { trend: 'unknown', delta: 0 }
  
  const firstScore = timeline[0].score
  const lastScore = timeline[timeline.length - 1].score
  const delta = lastScore - firstScore
  
  let trend = 'flat'
  if (delta > 0.2) trend = 'improving'
  else if (delta < -0.2) trend = 'degrading'
  
  return { trend, delta, firstScore, lastScore }
}

// ===== メンバー別分析 =====

const memberStats = {}
const globalStats = {
  totalCalls: calls.length,
  totalDuration: 0,
  outcomes: {},
  sentimentScores: [],
  sentimentTrends: { improving: 0, flat: 0, degrading: 0, unknown: 0 },
  avgTurns: 0,
  avgSelfLength: 0,
  avgQuestions: 0,
}

for (const call of calls) {
  const name = call.user_name || '不明'
  
  if (!memberStats[name]) {
    memberStats[name] = {
      email: call.user_email,
      calls: 0,
      totalDuration: 0,
      outcomes: {},
      sentimentScores: [],
      sentimentTrends: { improving: 0, flat: 0, degrading: 0, unknown: 0 },
      turnsList: [],
      selfLengthList: [],
      questionsList: [],
      gatekeeperList: [],
      refusalCounts: 0,
      refusalContinued: 0,
      closingQuestionsList: [],
      // 通話時間帯分布
      hourDistribution: {},
      // outbound/inbound
      directions: { outbound: 0, inbound: 0 },
    }
  }
  
  const m = memberStats[name]
  m.calls++
  m.totalDuration += call.duration
  globalStats.totalDuration += call.duration
  
  // direction
  m.directions[call.direction] = (m.directions[call.direction] || 0) + 1
  
  // outcome
  const oc = call.outcome || 'unknown'
  m.outcomes[oc] = (m.outcomes[oc] || 0) + 1
  globalStats.outcomes[oc] = (globalStats.outcomes[oc] || 0) + 1
  
  // sentiment
  if (call.sentiment_score !== null && call.sentiment_score !== undefined) {
    m.sentimentScores.push(call.sentiment_score)
    globalStats.sentimentScores.push(call.sentiment_score)
  }
  
  // sentiment trajectory
  const traj = analyzeSentimentTrajectory(call.sentiment_timeline)
  m.sentimentTrends[traj.trend]++
  globalStats.sentimentTrends[traj.trend]++
  
  // transcript分析
  const { selfUtterances, otherUtterances, turns } = parseTranscript(call.transcript)
  
  m.turnsList.push(turns)
  
  // 自社発話の平均文字数
  if (selfUtterances.length > 0) {
    const avgLen = selfUtterances.reduce((sum, u) => sum + u.length, 0) / selfUtterances.length
    m.selfLengthList.push(avgLen)
  }
  
  // 質問数
  const qCount = countQuestions(selfUtterances)
  m.questionsList.push(qCount)
  
  // 担当者確認
  const gkCount = countGatekeeperQuestions(selfUtterances)
  m.gatekeeperList.push(gkCount)
  
  // 断り後の継続
  const refResult = calcRefusalContinuation(selfUtterances, otherUtterances)
  m.refusalCounts += refResult.refusalCount
  m.refusalContinued += refResult.continuedCount
  
  // クロージング質問
  const clCount = countClosingQuestions(selfUtterances)
  m.closingQuestionsList.push(clCount)
  
  // 時間帯
  const hour = new Date(call.date_time).getUTCHours() + 9 // JST変換
  const hKey = `${hour % 24}時`
  m.hourDistribution[hKey] = (m.hourDistribution[hKey] || 0) + 1
}

// ===== 集計・出力 =====

const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
const median = arr => {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

console.log('='.repeat(70))
console.log('📈 テレアポ通話 定量分析レポート（4月）')
console.log('='.repeat(70))
console.log()

// 全体統計
console.log('■ 全体統計')
console.log(`  通話件数: ${calls.length}`)
console.log(`  合計通話時間: ${Math.round(globalStats.totalDuration / 60)}分`)
console.log(`  平均通話時間: ${Math.round(globalStats.totalDuration / calls.length)}秒`)
console.log(`  平均センチメント: ${avg(globalStats.sentimentScores).toFixed(2)}`)
console.log()

console.log('  outcome分布:')
for (const [oc, count] of Object.entries(globalStats.outcomes).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${oc}: ${count}件 (${(count / calls.length * 100).toFixed(1)}%)`)
}
console.log()

console.log('  センチメント推移:')
for (const [trend, count] of Object.entries(globalStats.sentimentTrends)) {
  console.log(`    ${trend}: ${count}件 (${(count / calls.length * 100).toFixed(1)}%)`)
}
console.log()

// メンバー別
const analysisResult = {}

for (const [name, m] of Object.entries(memberStats).sort((a, b) => b[1].calls - a[1].calls)) {
  const avgDuration = Math.round(m.totalDuration / m.calls)
  const avgTurns = avg(m.turnsList).toFixed(1)
  const avgSelfLen = avg(m.selfLengthList).toFixed(1)
  const avgQuestions = avg(m.questionsList).toFixed(1)
  const avgGatekeeper = avg(m.gatekeeperList).toFixed(1)
  const refRate = m.refusalCounts > 0 ? (m.refusalContinued / m.refusalCounts * 100).toFixed(1) : 'N/A'
  const avgClosing = avg(m.closingQuestionsList).toFixed(1)
  const avgSentiment = avg(m.sentimentScores).toFixed(2)
  const apptCount = m.outcomes.appointment_set || 0
  const apptRate = (apptCount / m.calls * 100).toFixed(1)
  const degradingRate = (m.sentimentTrends.degrading / m.calls * 100).toFixed(1)
  
  console.log('-'.repeat(70))
  console.log(`■ ${name} (${m.email})`)
  console.log('-'.repeat(70))
  console.log(`  通話件数: ${m.calls}件`)
  console.log(`  平均通話時間: ${avgDuration}秒`)
  console.log(`  アポ獲得: ${apptCount}件 (率: ${apptRate}%)`)
  console.log()
  console.log(`  【会話構造】`)
  console.log(`    平均ターン数: ${avgTurns}`)
  console.log(`    平均自社発話長: ${avgSelfLen}文字`)
  console.log(`    平均質問数: ${avgQuestions}問/通話`)
  console.log(`    担当者確認率: ${avgGatekeeper}回/通話`)
  console.log(`    クロージング質問: ${avgClosing}問/通話`)
  console.log()
  console.log(`  【断り対応】`)
  console.log(`    断りフレーズ検出: ${m.refusalCounts}回`)
  console.log(`    断り後継続率: ${refRate}%`)
  console.log()
  console.log(`  【センチメント】`)
  console.log(`    平均スコア: ${avgSentiment}`)
  console.log(`    感情悪化率: ${degradingRate}%`)
  console.log(`    推移: 改善${m.sentimentTrends.improving} / 維持${m.sentimentTrends.flat} / 悪化${m.sentimentTrends.degrading}`)
  console.log()
  console.log(`  【outcome】`)
  for (const [oc, count] of Object.entries(m.outcomes).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${oc}: ${count}件 (${(count / m.calls * 100).toFixed(1)}%)`)
  }
  console.log()
  
  // JSON出力用
  analysisResult[name] = {
    email: m.email,
    calls: m.calls,
    avgDuration: avgDuration,
    appointmentCount: apptCount,
    appointmentRate: parseFloat(apptRate),
    avgTurns: parseFloat(avgTurns),
    avgSelfUtteranceLength: parseFloat(avgSelfLen),
    medianSelfUtteranceLength: parseFloat(median(m.selfLengthList).toFixed(1)),
    avgQuestions: parseFloat(avgQuestions),
    avgGatekeeperQuestions: parseFloat(avgGatekeeper),
    avgClosingQuestions: parseFloat(avgClosing),
    refusalCount: m.refusalCounts,
    refusalContinuationRate: m.refusalCounts > 0 ? parseFloat(refRate) : null,
    avgSentiment: parseFloat(avgSentiment),
    sentimentDegradingRate: parseFloat(degradingRate),
    sentimentTrends: m.sentimentTrends,
    outcomes: m.outcomes,
    directions: m.directions,
    hourDistribution: m.hourDistribution,
  }
}

// JSON保存
const outputFile = inputFile.replace('calls-full-', 'analysis-').replace('.json', '-result.json')
await writeFile(outputFile, JSON.stringify(analysisResult, null, 2))
console.log(`\n✅ 分析結果を ${outputFile} に保存しました`)
