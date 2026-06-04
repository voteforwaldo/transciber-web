# Host Transciber online (full YouTube support)

Vercel cannot download most YouTube videos (Google blocks datacenter IPs).  
**Render + Docker** runs the same stack as your laptop: yt-dlp, cookies, Speechmatics.

## Steps (~10 minutes)

1. Push this folder to a **GitHub** repository.

2. Go to [render.com](https://render.com) → sign up → **New** → **Blueprint**.

3. Connect the repo. Render reads `render.yaml` and creates **transciber-web**.

4. When prompted, set secrets:

   | Key | Value |
   |-----|--------|
   | `SPEECHMATICS_API_KEY` | same as `.env.local` |
   | `GEMINI_API_KEY` | same as `.env.local` |
   | `YTDLP_COOKIES` | paste full `config/youtube-cookies.txt` (export from Chrome on youtube.com) |

5. Click **Deploy**. Wait until status is **Live**.

6. Open your URL: `https://transciber-web-xxxx.onrender.com`

Paste any YouTube link — it should work like `run-local.bat`.

## Optional: custom domain

Render dashboard → your service → **Settings** → **Custom Domains**.

## Keep Vercel?

You can use Vercel for the UI and Render for API only (advanced).  
Simplest: use **only Render** for everything.
