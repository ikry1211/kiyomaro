/**
 * テレアポ トークガイドの検証スクリプト
 * 
 * ガイドの主張（仮説）を4月データで検証する:
 * 1. 質問数と成果の相関
 * 2. 断り後継続率と成果の相関
 * 3. 発話長とrefused率の相関
 * 4. クロージング質問とアポ率の相関
 * 5. ヒアリング先行 vs 提案先行
 * 6. 断り対応の型（受容→別角度→布石）の実態
 */
import { readFile, writeFile } from 'node:fs/promises'

const EXCLUDE_EMAILS = ['kana.ishimaru@rakuco.jp']
const inputFile = process.argv[2] || 'calls-full-2026-04-01-2026-04-17.json'

const raw = JSON.parse(await readFile(inputFile, 'utf-8'))
const calls = (raw.data || raw).filter(c => !EXCLUDE_EMAILS.includes(c.user_email))

console.log(`📋 トークガイド検証: ${calls.length}件のテレアポデータ`)
console.log()

// ===== ユーティリティ =====

function parseTranscript(transcript) {
  if (!transcript) return { selfUtterances: [], otherUtterances: [], turns: 0, lines: [] }
  const lines = transcript.split('\n').filter(l => l.trim())
  const selfUtterances = []
  const otherUtterances = []
  const ordered = [] // {speaker, text}
  
  for (const line of lines) {
    if (line.startsWith('自社:') || line.startsWith('自社：')) {
      const text = line.replace(/^自社[:：]\s*/, '')
      selfUtterances.push(text)
      ordered.push({ speaker: 'self', text })
    } else if (line.startsWith('相手先:') || line.startsWith('相手先：')) {
      const text = line.replace(/^相手先[:：]\s*/, '')
      otherUtterances.push(text)
      ordered.push({ speaker: 'other', text })
    }
  }
  return { selfUtterances, otherUtterances, turns: ordered.length, ordered }
}

function hasQuestion(text) {
  return [/？/, /\?/, /ですか/, /ますか/, /でしょうか/, /ございますか/, /いかがでしょう/].some(p => p.test(text))
}

function isRefusal(text) {
  return [/結構です/, /間に合って/, /必要ない/, /いらない/, /いりません/, /お断り/,
    /興味ない/, /興味ありません/, /今はちょっと/, /けっこう/, /大丈夫です/,
    /お気持ちだけ/, /遠慮/].some(p => p.test(text))
}

function isClosingQuestion(text) {
  return [/何日/, /何時/, /日程/, /いつ/, /ご都合/, /スケジュール/, /予定/,
    /お時間/, /\d+時/, /\d+日/, /来週/, /再来週/, /今週/,
    /Zoom/, /zoom/, /オンライン/, /デモ/, /ご案内/].some(p => p.test(text))
}

function isHearingQuestion(text) {
  return [/お使い/, /何をお使い/, /いくら/, /月額/, /困って/, /お困り/, /事業形態/, /A型/, /B型/,
    /どちらの/, /今は何/, /システムは/].some(p => p.test(text))
}

function isProposal(text) {
  return [/ラクコ/, /バージョンアップ/, /月額/, /19,800/, /無料/, /キャンペーン/,
    /支援記録/, /勤怠/, /請求/, /コスト削減/, /40%/, /50%/].some(p => p.test(text))
}

// ===== 通話レベルの指標計算 =====

const callMetrics = calls.map(call => {
  const { selfUtterances, otherUtterances, turns, ordered } = parseTranscript(call.transcript)
  
  const questionCount = selfUtterances.filter(hasQuestion).length
  const hearingQuestionCount = selfUtterances.filter(isHearingQuestion).length
  const closingQuestionCount = selfUtterances.filter(isClosingQuestion).length
  const avgSelfLength = selfUtterances.length > 0 
    ? selfUtterances.reduce((s, u) => s + u.length, 0) / selfUtterances.length 
    : 0
  
  // 断り後継続
  let refusalCount = 0, continuedAfterRefusal = 0
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].speaker === 'other' && isRefusal(ordered[i].text)) {
      refusalCount++
      // 次に自社の発話があるか
      if (i + 1 < ordered.length && ordered[i + 1]?.speaker === 'self') {
        continuedAfterRefusal++
      }
    }
  }
  
  // ヒアリング先行 vs 提案先行の判定
  let firstHearingIndex = -1
  let firstProposalIndex = -1
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].speaker === 'self') {
      if (firstHearingIndex === -1 && isHearingQuestion(ordered[i].text)) firstHearingIndex = i
      if (firstProposalIndex === -1 && isProposal(ordered[i].text)) firstProposalIndex = i
    }
  }
  const hearingFirst = firstHearingIndex !== -1 && firstProposalIndex !== -1 
    ? firstHearingIndex < firstProposalIndex 
    : firstHearingIndex !== -1 // ヒアリングだけの場合もtrue

  // 断り後の対応パターン分析（受容→別角度→布石の3ステップ）
  let hasReceptionAfterRefusal = false
  let hasAlternateAfterRefusal = false
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].speaker === 'other' && isRefusal(ordered[i].text)) {
      // 断りの後の自社発話を見る
      for (let j = i + 1; j < Math.min(i + 4, ordered.length); j++) {
        if (ordered[j].speaker === 'self') {
          if (/そうだったんですね|承知|かしこまり|ありがとう/.test(ordered[j].text)) {
            hasReceptionAfterRefusal = true
          }
          if (hasQuestion(ordered[j].text) && !isHearingQuestion(ordered[j].text)) {
            hasAlternateAfterRefusal = true
          }
        }
      }
    }
  }
  
  return {
    id: call.id,
    userName: call.user_name,
    outcome: call.outcome,
    duration: call.duration,
    sentimentScore: call.sentiment_score,
    sentimentTimeline: call.sentiment_timeline,
    turns,
    questionCount,
    hearingQuestionCount,
    closingQuestionCount,
    avgSelfLength,
    refusalCount,
    continuedAfterRefusal,
    refusalContinuationRate: refusalCount > 0 ? continuedAfterRefusal / refusalCount : null,
    hearingFirst,
    hasReceptionAfterRefusal,
    hasAlternateAfterRefusal,
  }
})

// ===== 検証1: 質問数と成果の相関 =====
console.log('='.repeat(70))
console.log('✅ 検証1: ガイド主張「質問数と獲得効率はほぼ線形の相関がある」')
console.log('='.repeat(70))

const questionBuckets = { '0問': [], '1問': [], '2問': [], '3問以上': [] }
for (const m of callMetrics) {
  if (m.questionCount === 0) questionBuckets['0問'].push(m)
  else if (m.questionCount === 1) questionBuckets['1問'].push(m)
  else if (m.questionCount === 2) questionBuckets['2問'].push(m)
  else questionBuckets['3問以上'].push(m)
}

console.log('| 質問数 | 通話数 | アポ件数 | アポ率 | 平均通話時間 | 平均センチメント |')
console.log('|:---|---:|---:|---:|---:|---:|')
for (const [label, bucket] of Object.entries(questionBuckets)) {
  const appt = bucket.filter(m => m.outcome === 'appointment_set').length
  const rate = bucket.length > 0 ? (appt / bucket.length * 100).toFixed(1) : '0.0'
  const avgDur = bucket.length > 0 ? Math.round(bucket.reduce((s, m) => s + m.duration, 0) / bucket.length) : 0
  const avgSent = bucket.length > 0 ? (bucket.filter(m => m.sentimentScore !== null).reduce((s, m) => s + m.sentimentScore, 0) / bucket.filter(m => m.sentimentScore !== null).length).toFixed(2) : '—'
  console.log(`| ${label} | ${bucket.length} | ${appt} | ${rate}% | ${avgDur}秒 | ${avgSent} |`)
}
console.log()

// ===== 検証2: 断り後継続率と成果の相関 =====
console.log('='.repeat(70))
console.log('✅ 検証2: ガイド主張「断り対応の型を持っているかが成果を最も分ける」')
console.log('='.repeat(70))

// 断りがあった通話のみ
const refusalCalls = callMetrics.filter(m => m.refusalCount > 0)
const continued = refusalCalls.filter(m => m.refusalContinuationRate >= 0.5)
const notContinued = refusalCalls.filter(m => m.refusalContinuationRate < 0.5)

console.log(`断りがあった通話: ${refusalCalls.length}件`)
console.log()
console.log('| 断り後の対応 | 通話数 | アポ件数 | アポ率 | follow_up率 | refused率 |')
console.log('|:---|---:|---:|---:|---:|---:|')
for (const [label, bucket] of [['継続(50%以上)', continued], ['即終了(50%未満)', notContinued]]) {
  const appt = bucket.filter(m => m.outcome === 'appointment_set').length
  const followUp = bucket.filter(m => m.outcome === 'follow_up').length
  const refused = bucket.filter(m => m.outcome === 'refused').length
  console.log(`| ${label} | ${bucket.length} | ${appt} | ${(appt/bucket.length*100).toFixed(1)}% | ${(followUp/bucket.length*100).toFixed(1)}% | ${(refused/bucket.length*100).toFixed(1)}% |`)
}
console.log()

// 受容→別角度パターンの検証
const withReception = refusalCalls.filter(m => m.hasReceptionAfterRefusal)
const withAlternate = refusalCalls.filter(m => m.hasAlternateAfterRefusal)
console.log(`断り後に「受容」フレーズあり: ${withReception.length}件 (${(withReception.length/refusalCalls.length*100).toFixed(1)}%)`)
console.log(`断り後に「別角度の質問」あり: ${withAlternate.length}件 (${(withAlternate.length/refusalCalls.length*100).toFixed(1)}%)`)
const withBoth = refusalCalls.filter(m => m.hasReceptionAfterRefusal && m.hasAlternateAfterRefusal)
console.log(`両方あり（受容→別角度）: ${withBoth.length}件 (${(withBoth.length/refusalCalls.length*100).toFixed(1)}%)`)
const bothAppt = withBoth.filter(m => m.outcome === 'appointment_set').length
const neitherCalls = refusalCalls.filter(m => !m.hasReceptionAfterRefusal && !m.hasAlternateAfterRefusal)
const neitherAppt = neitherCalls.filter(m => m.outcome === 'appointment_set').length
console.log(`  → 受容+別角度あり → アポ率: ${withBoth.length > 0 ? (bothAppt/withBoth.length*100).toFixed(1) : 0}%`)
console.log(`  → どちらもなし → アポ率: ${neitherCalls.length > 0 ? (neitherAppt/neitherCalls.length*100).toFixed(1) : 0}%`)
console.log()

// ===== 検証3: 発話長とrefused率の相関 =====
console.log('='.repeat(70))
console.log('✅ 検証3: ガイド主張「情報量が多いほど良いわけではない。感情を悪化させる」')
console.log('='.repeat(70))

const lengthBuckets = { '〜25文字': [], '26-40文字': [], '41-55文字': [], '56文字〜': [] }
for (const m of callMetrics) {
  if (m.avgSelfLength <= 25) lengthBuckets['〜25文字'].push(m)
  else if (m.avgSelfLength <= 40) lengthBuckets['26-40文字'].push(m)
  else if (m.avgSelfLength <= 55) lengthBuckets['41-55文字'].push(m)
  else lengthBuckets['56文字〜'].push(m)
}

console.log('| 発話長 | 通話数 | refused率 | アポ率 | 感情悪化率 |')
console.log('|:---|---:|---:|---:|---:|')
for (const [label, bucket] of Object.entries(lengthBuckets)) {
  const refused = bucket.filter(m => m.outcome === 'refused').length
  const appt = bucket.filter(m => m.outcome === 'appointment_set').length
  const degrading = bucket.filter(m => {
    if (!m.sentimentTimeline || m.sentimentTimeline.length < 2) return false
    return m.sentimentTimeline[m.sentimentTimeline.length - 1].score - m.sentimentTimeline[0].score < -0.2
  }).length
  console.log(`| ${label} | ${bucket.length} | ${(refused/bucket.length*100).toFixed(1)}% | ${(appt/bucket.length*100).toFixed(1)}% | ${(degrading/bucket.length*100).toFixed(1)}% |`)
}
console.log()

// ===== 検証4: クロージング質問とアポ率 =====
console.log('='.repeat(70))
console.log('✅ 検証4: ガイド主張「その場確定型 or 布石型のどちらかの型を持つこと」')
console.log('='.repeat(70))

const closingBuckets = { '0問': [], '1問': [], '2問以上': [] }
for (const m of callMetrics) {
  if (m.closingQuestionCount === 0) closingBuckets['0問'].push(m)
  else if (m.closingQuestionCount === 1) closingBuckets['1問'].push(m)
  else closingBuckets['2問以上'].push(m)
}

console.log('| クロージング質問 | 通話数 | アポ件数 | アポ率 |')
console.log('|:---|---:|---:|---:|')
for (const [label, bucket] of Object.entries(closingBuckets)) {
  const appt = bucket.filter(m => m.outcome === 'appointment_set').length
  console.log(`| ${label} | ${bucket.length} | ${appt} | ${(appt/bucket.length*100).toFixed(1)}% |`)
}
console.log()

// ===== 検証5: ヒアリング先行 vs 提案先行 =====
console.log('='.repeat(70))
console.log('✅ 検証5: ガイド主張「B(ヒアリング)の前にC(提案)をしない」')
console.log('='.repeat(70))

// ヒアリングと提案の両方が検出された通話のみ
const bothDetected = callMetrics.filter(m => {
  const { selfUtterances } = parseTranscript(calls.find(c => c.id === m.id)?.transcript)
  return selfUtterances.some(isHearingQuestion) && selfUtterances.some(isProposal)
})

const hearingFirstCalls = bothDetected.filter(m => m.hearingFirst)
const proposalFirstCalls = bothDetected.filter(m => !m.hearingFirst)

console.log(`ヒアリング+提案が両方ある通話: ${bothDetected.length}件`)
console.log()
console.log('| 順序 | 通話数 | アポ件数 | アポ率 | refused率 | 平均センチメント |')
console.log('|:---|---:|---:|---:|---:|---:|')
for (const [label, bucket] of [['ヒアリング先行', hearingFirstCalls], ['提案先行', proposalFirstCalls]]) {
  const appt = bucket.filter(m => m.outcome === 'appointment_set').length
  const refused = bucket.filter(m => m.outcome === 'refused').length
  const avgSent = bucket.filter(m => m.sentimentScore !== null).length > 0
    ? (bucket.filter(m => m.sentimentScore !== null).reduce((s, m) => s + m.sentimentScore, 0) / bucket.filter(m => m.sentimentScore !== null).length).toFixed(2)
    : '—'
  console.log(`| ${label} | ${bucket.length} | ${appt} | ${(appt/bucket.length*100).toFixed(1)}% | ${(refused/bucket.length*100).toFixed(1)}% | ${avgSent} |`)
}
console.log()

// ===== 検証6: ターン数と成果 =====
console.log('='.repeat(70))
console.log('参考: ターン数と成果の関係')
console.log('='.repeat(70))

const turnBuckets = { '〜10': [], '11-20': [], '21-30': [], '31〜': [] }
for (const m of callMetrics) {
  if (m.turns <= 10) turnBuckets['〜10'].push(m)
  else if (m.turns <= 20) turnBuckets['11-20'].push(m)
  else if (m.turns <= 30) turnBuckets['21-30'].push(m)
  else turnBuckets['31〜'].push(m)
}

console.log('| ターン数 | 通話数 | アポ件数 | アポ率 | follow_up率 |')
console.log('|:---|---:|---:|---:|---:|')
for (const [label, bucket] of Object.entries(turnBuckets)) {
  const appt = bucket.filter(m => m.outcome === 'appointment_set').length
  const followUp = bucket.filter(m => m.outcome === 'follow_up').length
  console.log(`| ${label} | ${bucket.length} | ${appt} | ${(appt/bucket.length*100).toFixed(1)}% | ${(followUp/bucket.length*100).toFixed(1)}% |`)
}
console.log()

console.log('✅ 検証完了')
