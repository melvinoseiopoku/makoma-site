# How the M'AKOMA waitlist is wired (Buttondown)

**Status: live.** Signups land in your Buttondown list, and each one now also carries the
bracelet the visitor designed in the "Who are your five?" section — which is what turns the
waitlist into a manufacturing decision, not just an email list.

> This file previously described a `WAITLIST = { endpoint, mode, emailField, metaPrefix }`
> object with `metadata__source` / `metadata__at`. **None of that ever existed in the code.**
> Corrected 2026-07-28.

The endpoint is a single constant near the top of the form section in [`js/main.js`](js/main.js):

```js
const JOIN_ENDPOINT = "https://buttondown.com/api/emails/embed-subscribe/makoma";
```

(Note `buttondown.com`, not `buttondown.email` — and the trailing segment is your Buttondown
username, which is public, so no API key or secret is involved.)

Each signup sends `email`, `embed`, `tag` (self / gift), plus these `metadata__*` fields:

| field | value | why |
|---|---|---|
| `intent` | `self` \| `gift` | who it's for |
| `suggestion` | free text | the optional design-feedback box |
| `shell` | `onyx` \| `clay` \| `forest` \| `midnight` \| `rose` \| `bone` | **the manufacturing vote** |
| `cfg` | `custom` \| `default` | did they actually touch a swatch? |
| `symbols` | 5 comma-separated Adinkra keys | which symbols people want |
| `glows` | 5 comma-separated hex values (no `#`) | light preference |
| `slots` | `0`–`5` | how many of the five they actually named |

**Counting colour votes:** tally `shell` over `cfg=custom` ONLY. A visitor who never touched a
swatch still submits `shell=onyx` (the default), so counting everything would just measure
traffic and would hand you the wrong three colours to manufacture.

**The five names are deliberately NOT sent.** They are personal data about third parties who
never visited the site and never consented; nothing about the manufacturing decision needs
them. They stay in `localStorage` under `makoma_design_v1`. See the note at the top of
[`js/design.js`](js/design.js).

**⚠️ Verify once after any change here.** The POST uses `mode: "no-cors"`, so the response is
opaque: the visitor sees "You're in" even if Buttondown rejected the request. After changing
any field, submit one real design on the live site and confirm the values actually appear on
the subscriber record in Buttondown.

---

## Option A — Buttondown (recommended: you already use it, and you can email the list later)

1. Find your **Buttondown username** — it's in your Buttondown account (Settings), and it's the handle in your newsletter URL `buttondown.email/<username>`. The username is **public**, so it's safe to put in the code (no API key/secret needed).
2. In [`js/main.js`](js/main.js), replace `YOUR_BUTTONDOWN_USERNAME` with it. Leave `mode`, `emailField`, and `metaPrefix` as-is.
3. Commit + push (and confirm it deploys to your live site).
4. **⚠️ TEST IT — this step is not optional.** Because Buttondown uses `no-cors`, the form will show "You're in!" *even if the username is wrong and nothing was captured.* So: open the live site, submit a real email, and **confirm that email appears in your Buttondown subscribers.** If it doesn't, the username is wrong (or try the `buttondown.com/...` domain instead of `buttondown.email/...`).

That's it — you're live.

> **Tip:** in Buttondown, turn **off** double opt-in (confirmation email) during a viral push if you want max captured signups, or leave it on for a cleaner, confirmed list. Your call.

---

## Alternative — Google Sheet (free, unlimited, you own the raw data)

Use this if you'd rather capture to a spreadsheet (no caps, no cost). Then set `metaPrefix: ""` (Sheets wants plain field names) and `mode: "no-cors"`.

1. New **Google Sheet** → **Extensions → Apps Script** → paste:
   ```js
   function doPost(e) {
     var lock = LockService.getScriptLock();
     lock.waitLock(30000);
     try {
       var ss = SpreadsheetApp.getActiveSpreadsheet();
       var sheet = ss.getSheetByName('Waitlist') || ss.insertSheet('Waitlist');
       if (sheet.getLastRow() === 0) sheet.appendRow(['Timestamp', 'Email', 'Intent', 'Source']);
       var p = (e && e.parameter) || {};
       sheet.appendRow([new Date(), p.email || '', p.intent || '', p.source || '']);
       return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
     } finally { lock.releaseLock(); }
   }
   ```
2. **Deploy → New deployment → Web app**, Execute as **Me**, access **Anyone**. Copy the `/exec` URL into `endpoint`, set `metaPrefix: ""`.

*(Formspree and Kit also work — set `mode: "cors"`; Kit uses `emailField: "email_address"`.)*

---

## Drive the viral traffic here (while attention is hot)

- **Instagram bio link, tagged for attribution:**
  `https://your-makoma-site/?utm_source=instagram#join`
  → every signup carries `source = instagram` in Buttondown, so you can later prove **"my viral reel drove N signups."**
- Pin a comment / add a Story with the same link; end your next reel with *"Link in bio to reserve your bracelet."*
- `#join` jumps visitors straight to the form.

## Turn the list into the investor story

- **Conversion:** "136K views → X site visits → Y signups = Z% conversion."
- **A repeatable channel:** signups tagged `instagram` prove you can acquire demand on demand.
- **Real intent:** a growing, *owned* email list of people waiting for the product — the most credible pre-product traction signal there is.

> This is an **email waitlist** — no money changes hands, so there's no fulfillment obligation and no OPT/tax complication. Pure, clean demand proof.
