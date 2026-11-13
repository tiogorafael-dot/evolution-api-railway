// Corrige o bug do Baileys 7.0.0-rc.9 (Evolution API 2.3.7): o WhatsApp manda nós <status>
// (Status/Stories) que nunca são confirmados; o servidor segura as mensagens e derruba a
// conexão a cada ~50 min. Aqui confirmamos (ack) esses nós, inclusive na fila offline.
// Refs: evolution-foundation/evolution-api#2778, WhiskeySockets/Baileys#2858.
// Falha o build se o código esperado não for encontrado (o deploy anterior continua no ar).
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const arquivos = execSync(
  "find / -path /proc -prune -o -path '*/baileys/lib/Socket/messages-recv.js' -print 2>/dev/null || true"
)
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);
if (!arquivos.length) throw new Error("messages-recv.js do Baileys não encontrado");

const trocas = [
  [
    "    const makeOfflineNodeProcessor = () => {\n        const nodeProcessorMap = new Map([",
    "    const handleStatusStanza = async (node) => {\n        await sendMessageAck(node);\n    };\n    const makeOfflineNodeProcessor = () => {\n        const nodeProcessorMap = new Map([\n            ['status', handleStatusStanza],",
  ],
  [
    "                    await nodeProcessor(node);\n",
    "                    try {\n                        await nodeProcessor(node);\n                    }\n                    catch (error) {\n                        onUnexpectedError(error, 'processing offline node');\n                    }\n",
  ],
  [
    "    ws.on('CB:ack,class:message', (node) => {",
    "    ws.on('CB:status', async (node) => {\n        await processNode('status', node, 'acking status stanza', handleStatusStanza);\n    });\n    ws.on('CB:ack,class:message', (node) => {",
  ],
];

for (const arq of arquivos) {
  let s = fs.readFileSync(arq, "utf8");
  if (s.includes("handleStatusStanza")) {
    console.log("[patch] já aplicado:", arq);
    continue;
  }
  for (const [antes, depois] of trocas) {
    const n = s.split(antes).length - 1;
    if (n !== 1) throw new Error(`[patch] trecho encontrado ${n} vezes em ${arq}: ${antes.slice(0, 60)}`);
    s = s.replace(antes, depois);
  }
  fs.writeFileSync(arq, s);
  execSync(`node --check "${arq}"`);
  console.log("[patch] aplicado:", arq);
}
