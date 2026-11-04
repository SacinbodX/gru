// JSON ombor: data/*.json avtomatik yaratiladi, GitHub'ga zaxira (backup) qilinadi
import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'data');
const DEFAULTS = { 'users.json': {}, 'stats.json': { days: {} }, 'words_custom.json': [] };
const { GITHUB_TOKEN: TK, GITHUB_REPO: REPO, GITHUB_BRANCH: BR = 'data' } = process.env;
const GH = !!(TK && REPO);
const H = { Authorization: `Bearer ${TK}`, 'User-Agent': 'english-bot', Accept: 'application/vnd.github+json' };
const url = f => `https://api.github.com/repos/${REPO}/contents/data/${f}`;
const shas = {}, cache = {}, dirty = new Set(), ghDirty = new Set();

async function pull(f) {
  const r = await fetch(`${url(f)}?ref=${BR}`, { headers: H });
  if (!r.ok) return null;
  const d = await r.json();
  shas[f] = d.sha;
  return Buffer.from(d.content, 'base64').toString();
}
async function push(f) {
  const body = { message: `data: ${f}`, branch: BR, content: Buffer.from(JSON.stringify(cache[f], null, 1)).toString('base64'), ...(shas[f] ? { sha: shas[f] } : {}) };
  const r = await fetch(url(f), { method: 'PUT', headers: H, body: JSON.stringify(body) });
  const d = await r.json();
  if (d.content) shas[f] = d.content.sha; else throw new Error(d.message);
}

export async function init() {
  fs.mkdirSync(DIR, { recursive: true });
  for (const [f, def] of Object.entries(DEFAULTS)) {
    const p = path.join(DIR, f);
    let txt = GH ? await pull(f).catch(() => null) : null;   // GitHub'dan tiklash
    if (txt) fs.writeFileSync(p, txt);
    else if (!fs.existsSync(p)) { fs.writeFileSync(p, JSON.stringify(def)); if (GH) ghDirty.add(f); }
    try { cache[f] = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { if (fs.existsSync(p)) fs.copyFileSync(p, p + '.broken'); cache[f] = structuredClone(def); }
  }
  console.log('Store ready', GH ? `(GitHub backup: ${REPO}@${BR})` : '(faqat lokal)');
}
export const db = f => cache[f];

let timer;
export function touch(f) { dirty.add(f); ghDirty.add(f); clearTimeout(timer); timer = setTimeout(flush, 2000); }
export function flush() {
  for (const f of dirty) { const p = path.join(DIR, f); fs.writeFileSync(p + '.tmp', JSON.stringify(cache[f])); fs.renameSync(p + '.tmp', p); }
  dirty.clear();
}
if (GH) setInterval(async () => {
  for (const f of [...ghDirty]) { ghDirty.delete(f); await push(f).catch(e => { console.warn('GH push', e.message); ghDirty.add(f); }); }
}, 60000);
export async function shutdown() { flush(); if (GH) for (const f of ghDirty) await push(f).catch(() => {}); }
