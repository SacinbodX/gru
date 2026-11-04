# English Learning — Telegram Bot + Mini App

Node.js (Express + Telegraf) · Groq AI · JSON ombor (baza yo'q) · Render + GitHub

## Tuzilma
- `server.js` — bot, API, Telegram initData tekshiruvi, Groq proxy, limit (30 so'rov/daqiqa)
- `store.js` — `data/*.json` ni avtomatik yaratadi, atomik yozadi, GitHub'ga zaxira qiladi
- `data/users.json` (foydalanuvchilar, XP, streak), `stats.json` (kunlik hisoblagich), `words_custom.json` (AI qo'shgan so'zlar)
- `public/` — Mini App (`index.html`, `words.js`)
- `php/store.php` — ixtiyoriy, PHP hosting uchun (Render Node'da ishlamaydi)
- `.github/workflows/keepalive.yml` — Render uxlab qolmasligi uchun ping
- `render.yaml` — Render blueprint

## Ishga tushirish
1. @BotFather → `BOT_TOKEN`; console.groq.com → `GROQ_API_KEY`.
2. GitHub'da repo yarating, kodni push qiling, so'ng **`data` nomli bo'sh branch** yarating
   (ma'lumotlar shu yerga yoziladi, shuning uchun Render qayta deploy qilmaydi).
3. GitHub → Settings → Developer settings → Personal access token (repo huquqi) → `GITHUB_TOKEN`.
4. Render → New Web Service → repo. Build: `npm install`, Start: `npm start`.
5. Environment: `BOT_TOKEN`, `GROQ_API_KEY`, `WEBAPP_URL`, `GITHUB_TOKEN`, `GITHUB_REPO` (`user/repo`), `GITHUB_BRANCH=data`.
6. (Ixtiyoriy) Repo Secrets'ga `APP_URL` qo'shing — keepalive ishlaydi.

Render'da disk vaqtinchalik, shuning uchun GitHub zaxirasi yoqilmasa, qayta deploy paytida ma'lumotlar yo'qoladi.

## Lug'at
`public/words.js` da 33 ta so'z bor. Lug'at bo'limidagi "AI bilan 20 ta so'z qo'shish" tugmasi har bosilganda yangi so'zlarni
`words_custom.json` ga saqlaydi (jami 400 gacha, hamma foydalanuvchiga ko'rinadi).
