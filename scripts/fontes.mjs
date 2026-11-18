// Baixa a Satoshi direto do Fontshare (a licença não deixa redistribuir os arquivos)
// e copia os quatro pesos para public/fonts/ com os nomes que o tokens.css espera.
// Roda sozinho depois do `npm i` (postinstall) e pula se as fontes já estiverem lá.
// Só usa o que vem com o Node 18+: fetch e zlib.
import { inflateRawSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'public', 'fonts');
const URL_ZIP = 'https://api.fontshare.com/v2/fonts/download/satoshi';

const ARQUIVOS = {
  'Fonts/WEB/fonts/Satoshi-Regular.woff2': 'satoshi-regular.woff2',
  'Fonts/WEB/fonts/Satoshi-Medium.woff2': 'satoshi-medium.woff2',
  'Fonts/WEB/fonts/Satoshi-Bold.woff2': 'satoshi-bold.woff2',
  'Fonts/WEB/fonts/Satoshi-Black.woff2': 'satoshi-black.woff2',
  'License/FFL.txt': 'FFL.txt',
};

// Lê um .zip pelo diretório central (os tamanhos de lá são confiáveis) e devolve { caminho: Buffer }.
export function abrirZip(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('não parece um .zip');
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const saida = {};
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('diretório central inválido');
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nLen);
    p += 46 + nLen + xLen + cLen;
    if (nome.endsWith('/')) continue;
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(inicio, inicio + tamComp);
    if (metodo === 0) saida[nome] = Buffer.from(dados);
    else if (metodo === 8) saida[nome] = inflateRawSync(dados);
  }
  return saida;
}

function manual(motivo) {
  console.warn(`\nSatoshi: não deu para baixar (${motivo}).`);
  console.warn('Baixe à mão em https://www.fontshare.com/fonts/satoshi, abra o .zip e copie de Fonts/WEB/fonts/');
  console.warn('Satoshi-Regular, -Medium, -Bold e -Black (.woff2) para public/fonts/ em minúsculas:');
  console.warn('satoshi-regular.woff2, satoshi-medium.woff2, satoshi-bold.woff2, satoshi-black.woff2.\n');
  // não derruba o npm i: o site abre com a fonte do sistema até a Satoshi chegar
  process.exit(0);
}

async function principal() {
  const faltam = Object.values(ARQUIVOS).filter((n) => !existsSync(join(DESTINO, n)));
  if (!faltam.length && !process.argv.includes('--forcar')) {
    console.log('Satoshi: já está em public/fonts/.');
    return;
  }
  let buf;
  try {
    const r = await fetch(URL_ZIP);
    if (!r.ok) return manual(`HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return manual(e.cause?.code || e.message);
  }
  let zip;
  try { zip = abrirZip(buf); } catch (e) { return manual(e.message); }
  mkdirSync(DESTINO, { recursive: true });
  const nomes = Object.keys(zip);
  let copiados = 0;
  for (const [sufixo, alvo] of Object.entries(ARQUIVOS)) {
    const achado = nomes.find((n) => n === sufixo || n.endsWith('/' + sufixo));
    if (!achado) { console.warn(`Satoshi: ${sufixo} não está no .zip`); continue; }
    writeFileSync(join(DESTINO, alvo), zip[achado]);
    copiados++;
  }
  if (copiados < 4) return manual('o .zip veio sem algum peso');
  console.log(`Satoshi: ${copiados} arquivos em public/fonts/.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) principal();
