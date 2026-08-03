# Deploying the M'AKOMA site

This is a dependency-free static site (HTML/CSS/JS, no build step). Any static host works;
**Vercel** is the easiest and is what `vercel.json` is tuned for.

## 1. Ship it (Vercel — recommended)

1. Push this repo to GitHub (already done).
2. At [vercel.com/new](https://vercel.com/new), import the repo.
3. Set **Root Directory** to `website/` (the project's framework preset is "Other" — no build command, output dir = `.`).
4. Deploy. You get an HTTPS URL + global CDN + gzip/brotli automatically. `vercel.json` adds the caching headers.
5. Add your custom domain under **Project → Settings → Domains**.

> Netlify works too: "Add new site → Import", base directory `website/`, no build command, publish directory `website/`.
> (Caching headers would move to a `netlify.toml` / `_headers` file — ask and I'll add one.)

## 2. Swap the placeholder domain  →  3 spots

Search-replace `https://makoma.app` with your real domain (e.g. `https://thepeopleyoucarry.com`):

- `index.html` — `<link rel="canonical">`, the `og:*` and `twitter:*` tags, and the JSON-LD `url`/`image`.
- `robots.txt` — the `Sitemap:` line.
- `sitemap.xml` — the `<loc>` (and bump `<lastmod>` when you change the page).

## 3. Wire the waitlist email  ←  important

The form currently runs in **placeholder mode**: it validates and saves submissions to the
visitor's browser `localStorage` (`makoma_waitlist`) so nothing is lost, but it does **not** reach you yet.

In `js/main.js`, set `JOIN_ENDPOINT` to your provider's endpoint (the form POSTs `email` + `intent`):

| Provider | Endpoint | Notes |
|---|---|---|
| **Buttondown** | `https://buttondown.email/api/emails/embed-subscribe/YOUR_USERNAME` | Newsletter you can broadcast to later — best for a waitlist. Username is public, no secret in the code. |
| **Formspree** | `https://formspree.io/f/YOUR_FORM_ID` | Dead simple; emails you each submission. |
| **ConvertKit** | `https://app.convertkit.com/forms/YOUR_FORM_ID/subscriptions` | Full marketing automation. |

After setting it, submit a test address and confirm it lands in your provider's dashboard.

## 4. Social share image

`assets/img/og-image.jpg` (1200×630) is what unfurls when the link is shared. It's generated
from the brand assets (see `../brand/`). Regenerate it if the hero render or wordmark changes.

## 5. (Optional, recommended) Analytics

Add privacy-friendly, cookieless analytics so you can see traffic and signups:
**Vercel Web Analytics** (one toggle in the dashboard) or **Plausible**/**Fathom** (one script tag).
