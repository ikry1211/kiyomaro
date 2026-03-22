// 各メンバーの代表的な通話からAGENT発言を抽出する（軽量版）
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'conversations-20260320.json'), 'utf-8'));

const MEMBERS = ['鍵谷','福田','野島','日高','フジモト','カワカミ'];
const DISPLAY = {'鍵谷':'鍵谷','福田':'福田','野島':'野島','日高':'日高','フジモト':'藤本','カワカミ':'川上'};

for (const member of MEMBERS) {
  const convs = data.filter(c => c.agentName === member);
  
  // 結果別に分類して、各結果から1-2件ずつ取得
  const byResult = {};
  for (const c of convs) {
    if (!byResult[c.result]) byResult[c.result] = [];
    if (byResult[c.result].length < 2) byResult[c.result].push(c);
  }
  
  // 最大5件選出（様々な結果から）
  const samples = [];
  for (const [result, cs] of Object.entries(byResult)) {
    for (const c of cs) {
      if (samples.length >= 5) break;
      samples.push(c);
    }
  }
  
  const outFile = path.join(__dirname, `sample-${member}.txt`);
  let out = `=== ${DISPLAY[member]} (${convs.length}件中${samples.length}件抽出) ===\n\n`;
  
  for (const c of samples) {
    out += `--- [${c.result}] ${c.dateLocal} / ${c.turns}ターン ---\n`;
    if (c.summary) out += `要約: ${c.summary}\n`;
    out += `会話:\n`;
    for (const t of c.conversation.slice(0, 20)) { // 最大20ターンまで
      out += `  ${t.role}: ${t.text}\n`;
    }
    out += `\n`;
  }
  
  fs.writeFileSync(outFile, out, 'utf-8');
  console.log(`${DISPLAY[member]}: ${outFile} (${samples.length}件)`);
}
