import express from 'express';
import crypto from 'crypto';
import { Telegraf, Markup } from 'telegraf';
import * as store from './store.js';

const { BOT_TOKEN, GROQ_API_KEY, GROQ_MODEL = 'llama-3.3-70b-versatile', ALLOW_DEV } = process.env;
const PORT = process.env.PORT || 3000;
const URL = process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL;
await store.init();

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public'));
app.get('/health', (_, r) => r.send('ok'));

const today = () => new Date().toISOString().slice(0, 10);

// Telegram initData tekshiruvi (HMAC)
function auth(req) {
  const raw = req.get('x-init-data') || '';
  if (!raw) return ALLOW_DEV === '1' ? { id: 'dev', first_name: 'Dev' } : null;
  const p = new URLSearchParams(raw), hash = p.get('hash');
  p.delete('hash');
  const str = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN || '').digest();
  if (crypto.createHmac('sha256', secret).update(str).digest('hex') !== hash) return null;
  try { return JSON.parse(p.get('user')); } catch { return null; }
}
function me(req, res) {
  const u = auth(req);
  if (!u) { res.status(401).json({ error: 'unauthorized' }); return null; }
  const U = store.db('users.json'), id = String(u.id);
  if (!U[id]) {
    U[id] = { id, name: u.first_name || '', age: '', lang: 'uz', mine: [], xp: 0, streak: 0, best: 0, lastDay: '', log: [], created: Date.now() };
    const d = (store.db('stats.json').days[today()] ??= { ai: 0, users: 0 }); d.users++;
    store.touch('users.json'); store.touch('stats.json');
  }
  return U[id];
}
const hits = new Map();
const limited = id => { const n = Date.now(), a = (hits.get(id) || []).filter(x => n - x < 6e4); a.push(n); hits.set(id, a); return a.length > 30; };
const str = (v, n) => String(v ?? '').trim().slice(0, n);

async function groq(messages, json) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.7, max_tokens: 3000, ...(json ? { response_format: { type: 'json_object' } } : {}) })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'groq error');
  return d.choices[0].message.content;
}

app.post('/api/ai', async (req, res) => {
  const u = me(req, res); if (!u) return;
  if (limited(u.id)) return res.status(429).json({ error: 'Too many requests' });
  const { messages, json } = req.body;
  if (!Array.isArray(messages) || messages.length > 30) return res.status(400).json({ error: 'bad request' });
  try {
    const text = await groq(messages, json);
    (store.db('stats.json').days[today()] ??= { ai: 0, users: 0 }).ai++; store.touch('stats.json');
    res.json({ text });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/me', (req, res) => { const u = me(req, res); if (u) res.json({ user: u }); });
app.post('/api/me', (req, res) => {
  const u = me(req, res); if (!u) return;
  const b = req.body;
  if (b.name !== undefined) u.name = str(b.name, 40);
  if (b.age !== undefined) u.age = Math.min(99, Math.max(4, +b.age || 0)) || '';
  if (['uz', 'ru', 'en'].includes(b.lang)) u.lang = b.lang;
  if (Array.isArray(b.mine)) u.mine = b.mine.slice(0, 1000).map(x => ({ w: str(x.w, 40), tr: str(x.tr, 80) })).filter(x => x.w);
  store.touch('users.json');
  res.json({ user: u });
});

const GAIN = { speaking: 5, writing: 5, review: 1 };
app.post('/api/progress', (req, res) => {
  const u = me(req, res); if (!u) return;
  const { kind, level } = req.body;
  if (!['reading', 'listening', 'speaking', 'writing', 'review'].includes(kind)) return res.status(400).json({ error: 'kind' });
  const total = Math.min(20, Math.max(0, +req.body.total | 0)), score = Math.min(total, Math.max(0, +req.body.score | 0));
  const gain = GAIN[kind] ?? score * 2 + 5, d = today();
  const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (u.lastDay !== d) { u.streak = u.lastDay === yest ? u.streak + 1 : 1; u.lastDay = d; u.best = Math.max(u.best, u.streak); }
  u.xp += gain;
  u.log.push({ d, kind, level: str(level, 3), score, total, xp: gain });
  u.log = u.log.slice(-200);
  store.touch('users.json');
  res.json({ user: u, gain });
});

app.get('/api/top', (req, res) => {
  if (!me(req, res)) return;
  const top = Object.values(store.db('users.json')).sort((a, b) => b.xp - a.xp).slice(0, 10).map(u => ({ name: u.name, xp: u.xp, streak: u.streak }));
  res.json({ top });
});

// AI yordamida lug'atni kengaytirish (global, words_custom.json ga saqlanadi)
app.get('/api/words', (req, res) => { if (me(req, res)) res.json({ words: store.db('words_custom.json') }); });
app.post('/api/words/generate', async (req, res) => {
  const u = me(req, res); if (!u) return;
  if (limited(u.id)) return res.status(429).json({ error: 'Too many requests' });
  const W = store.db('words_custom.json');
  if (W.length >= 400) return res.json({ added: 0, total: W.length });
  const have = new Set([...(Array.isArray(req.body.have) ? req.body.have : []).map(x => str(x, 40).toLowerCase()), ...W.map(w => w[0].toLowerCase())]);
  try {
    const d = JSON.parse(await groq([
      { role: 'system', content: 'You create English vocabulary lists for learners.' },
      { role: 'user', content: `Give 20 useful, common English words (A1-B2), NOT in this list: ${[...have].slice(-300).join(', ')}. Return JSON {"words":[["word","verb|noun|adjective|adverb","Uzbek translation","Russian translation","short English example sentence"]]}` }
    ], true));
    let added = 0;
    for (const w of d.words || []) {
      if (!Array.isArray(w) || w.length < 5) continue;
      const x = w.slice(0, 5).map(v => str(v, 120));
      if (!x[0] || have.has(x[0].toLowerCase())) continue;
      have.add(x[0].toLowerCase()); W.push(x); added++;
    }
    store.touch('words_custom.json');
    res.json({ added, total: W.length });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.listen(PORT, () => console.log('Server on', PORT));

if (BOT_TOKEN) {
  const bot = new Telegraf(BOT_TOKEN);
  const kb = Markup.inlineKeyboard([[Markup.button.webApp('Open / Ochish / Открыть', URL)]]);
  bot.start(ctx => ctx.reply('Welcome to English Learning.\nIngliz tilini o‘rganish uchun pastdagi tugmani bosing.\nНажмите кнопку ниже, чтобы начать.', kb));
  bot.command('progress', ctx => {
    const u = store.db('users.json')[String(ctx.from.id)];
    ctx.reply(u ? `XP: ${u.xp}\nStreak: ${u.streak} (best ${u.best})\nWords: ${u.mine.length}` : 'No data yet — /start', kb);
  });
  bot.launch().then(() => bot.telegram.setChatMenuButton({ menuButton: { type: 'web_app', text: 'English', web_app: { url: URL } } }).catch(() => {}));
  const stop = async s => { await store.shutdown(); bot.stop(s); process.exit(0); };
  process.once('SIGTERM', () => stop('SIGTERM')); process.once('SIGINT', () => stop('SIGINT'));
}
