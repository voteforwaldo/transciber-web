# Transciber Web

YouTube transcription (Speechmatics) + AI summaries (Gemini). Web version of the [desktop transcriber](../transcriber).

## Features

- YouTube URL → timestamped transcript with speaker labels
- Search / filter / highlight in transcript
- Gemini summary in the transcript language
- Mobile-friendly UI
- **Local-first** — designed to run on your PC (`run-local.bat`)

## Quick start (Windows)

1. **Node.js LTS** — [nodejs.org](https://nodejs.org/)
2. **yt-dlp** on PATH — `yt-dlp --version` should work in PowerShell
3. **API keys** in `.env.local`:
   - `SPEECHMATICS_API_KEY`
   - `GEMINI_API_KEY`  
   `run-local.bat` can copy these from `../transcriber/config/secrets.ini`.

4. **YouTube cookies** (one-time):
   - Chrome extension: **Get cookies.txt LOCALLY**
   - Open https://www.youtube.com (logged in) → export cookies
   - Either:
     - **In the app:** open http://localhost:3010 → **Setup required** → upload the `.txt` file, or
     - **Script:** double-click `install-cookies.bat` and pick the file from Downloads
   - Verify: `check-cookies.bat` → `OK`

5. **Run:** double-click `run-local.bat` → open **http://localhost:3010**

Long videos may take several minutes.

## Scripts

| File | Purpose |
|------|---------|
| `run-local.bat` | Start dev server (port **3010**) |
| `install-cookies.bat` | Copy exported cookies into `config/` |
| `check-cookies.bat` | Verify cookies file exists |
| `open-cookies-folder.bat` | Open `config/` + instructions |

Automatic `export-cookies.bat` often fails on Windows (DPAPI) — use the Chrome extension instead.

## Project layout

```
app/api/          transcribe, summarize, status, setup/cookies
components/       TranscriberApp, SetupPanel
lib/              youtube (yt-dlp), speechmatics, gemini, setup
config/           youtube-cookies.txt (local only, gitignored)
```

## Deploy on Vercel

The app can run on Vercel with a few constraints:

| Requirement | Why |
|-------------|-----|
| **Vercel Pro** (recommended) | `/api/transcribe` is configured for up to **5 minutes** (`maxDuration: 300`). Hobby timeouts are too short for many videos. |
| **Environment variables** | Keys and cookies (see below). |
| **YouTube cookies in env** | Uploading cookies in the UI only lasts for a warm serverless instance. For production, set `YTDLP_COOKIES`. |

### 1. Push to GitHub

```bash
cd transciber-web
git add .
git commit -m "Prepare transciber web for Vercel"
git push
```

### 2. Import in Vercel

1. [vercel.com/new](https://vercel.com/new) → import the repo.
2. Framework: **Next.js** (auto-detected).
3. **Settings → Environment Variables** (Production + Preview):

| Variable | Value |
|----------|--------|
| `SPEECHMATICS_API_KEY` | Your Speechmatics key |
| `GEMINI_API_KEY` | Your Gemini key |
| `YTDLP_COOKIES` | Full Netscape cookies file from [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) on youtube.com (logged in). Paste as one value; line breaks can be literal or `\n`. |

Optional: `GEMINI_MODEL` (default `gemini-2.5-flash-lite`).

### 3. Deploy

Deploy from the dashboard or:

```bash
npm i -g vercel
cd transciber-web
vercel --prod
```

On each Linux build, `postinstall` downloads `vendor/yt-dlp` and Vercel bundles it into the transcribe function.

### 4. Verify

Open your deployment URL → **Setup required** should show green checks for API keys, yt-dlp, and cookies. Try a short YouTube video first.

**Still easier for daily use:** `run-local.bat` on your PC (no Pro plan, cookies in `config/`).

If Vercel blocks downloads or times out, use Docker on Railway/Fly instead.

## Environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `SPEECHMATICS_API_KEY` | Yes | |
| `GEMINI_API_KEY` | Yes | |
| `GEMINI_MODEL` | No | Default `gemini-2.5-flash-lite` |
| `YTDLP_COOKIES_FILE` | Local | Default `config/youtube-cookies.txt` |
| `YTDLP_COOKIES` | Deploy | Full Netscape cookie file as text |
