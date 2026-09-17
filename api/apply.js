/* ============================================================
   M'AKOMA — Founder Pilot application endpoint (Vercel Function)
   ------------------------------------------------------------
   The application form used to POST straight to Buttondown's public
   embed-subscribe endpoint. That endpoint is a NEWSLETTER SIGNUP: it has no
   concept of an application, no row per submission, no application date, and
   no status you can mark. Worse, most of the waitlist is already subscribed,
   and a signup endpoint's answer to "this email already exists" is an error
   page, not an update — so the people most likely to apply were the people
   most likely to have their application dropped on the floor.

     POST /api/apply    body = the application as JSON
                        -> { ok: true, stored, sheet, buttondown }

   THREE SINKS, ONE INVARIANT. The invariant: this endpoint returns 200 ONLY
   if the application was durably written somewhere. The site has been burned
   once already by a form that said "You're in" over an opaque response (see
   the note in js/main.js), and that must not happen again. Buttondown failing
   is survivable — every application is on file and can be re-tagged later.
   Losing the application itself is not.

     1. Vercel Blob   — the record of truth. Always on, no setup: the store
                        already exists for api/design-upload.js. One object per
                        applicant, keyed by email, so re-applying corrects the
                        earlier answer instead of creating a duplicate.
     2. Google Sheet  — optional (APPLY_SHEET_URL). The surface you actually
                        work on: sort, filter, and add your own columns for who
                        gets invited. Never the record of truth, because it is
                        a script you can accidentally unpublish.
     3. Buttondown    — optional (BUTTONDOWN_API_KEY). Tags the applicant so
                        you can mail applicants as a segment. Uses the real
                        API, not the embed endpoint, so an existing subscriber
                        is UPDATED rather than rejected.

   Applying is free and nothing here takes payment. Payment happens later and
   separately, in api/checkout.js.
   ============================================================ */

import { put } from "@vercel/blob";

const ALLOWED_ORIGINS = [
  "https://makoma.io",
  "https://www.makoma.io",
  "https://melvinoseiopoku.github.io",
  "http://127.0.0.1:8158",
  "http://localhost:8158",
  "http://127.0.0.1:8765",
  "http://localhost:8765",
];

const MAX_BODY = 8 * 1024;          // an application is a few hundred bytes
const EXTERNAL_TIMEOUT = 8000;      // a hung sheet must not hang the applicant
const BUTTONDOWN_TAG = "founder-pilot";

/* Buttondown's API host has moved once already (buttondown.email -> buttondown.com)
   and the response below reports what the call did, so a wrong default is a
   one-test fix rather than a silent no-op. Override with BUTTONDOWN_API_BASE. */
const BUTTONDOWN_BASE = (process.env.BUTTONDOWN_API_BASE || "https://api.buttondown.email/v1").replace(/\/+$/, "");

/* ---------- validation -------------------------------------------------- */
/* Everything here arrives from the public internet. Structural fields are
   checked against allowlists; free-text fields are checked for shape and
   length only, so editing the country list in the HTML cannot start silently
   rejecting real applications. */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* Log a code, never err.message: a provider's message can quote the request,
   headers included, straight back into your logs. */
function errorCode(err) {
  if (!err) return "unknown";
  if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
  if (err.name === "TypeError") return "network";
  return err.name || "error";
}

/* Control characters become spaces rather than vanishing, so a pasted newline
   separates two words instead of gluing them together. Written as a codepoint
   scan on purpose: a control-character class in the source is invisible to
   anyone reviewing this file. */
function clean(v, max) {
  if (v == null) return "";
  let out = "";
  for (const ch of String(v)) {
    const c = ch.codePointAt(0);
    out += (c < 32 || c === 127) ? " " : ch;
  }
  return out.trim().slice(0, max);
}

function validate(b) {
  const email = clean(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "a real email, please" };

  const group = clean(b.group, 16);
  if (group !== "circle" && group !== "single") return { error: "group must be circle or single" };

  const iphone = clean(b.iphone_all, 8);
  if (iphone !== "yes" && iphone !== "no") return { error: "iphone_all must be yes or no" };

  const bracelets = Number(b.bracelets);
  if (!Number.isInteger(bracelets) || bracelets < 1 || bracelets > 12) {
    return { error: "bracelets out of range" };
  }

  const nums = {};
  for (const k of ["price_each", "total"]) {
    const n = Number(b[k]);
    if (!Number.isFinite(n) || n < 0 || n > 100000) return { error: k + " out of range" };
    nums[k] = n;
  }

  return {
    application: {
      email,
      group,
      bracelets,
      iphone_all: iphone,
      country: clean(b.country, 60),
      circle_countries: clean(b.circle_countries, 400),
      price_each: nums.price_each,
      total: nums.total,
      disclaimers: clean(b.disclaimers, 120),
      source: clean(b.source, 120),
    },
  };
}

/* A stable, collision-free object name per applicant. The slug keeps the blob
   listing readable; the hash keeps a@b.com and a-b.com from sharing a key. */
function keyFor(email) {
  let h = 0x811c9dc5;
  for (let i = 0; i < email.length; i++) { h ^= email.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const slug = email.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `applications/${slug}-${h.toString(36)}.json`;
}

/* ---------- sinks ------------------------------------------------------- */

async function toSheet(row) {
  const url = process.env.APPLY_SHEET_URL;
  if (!url) return { ok: false, skipped: true };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
      redirect: "follow",                        // Apps Script /exec answers via a redirect
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT),
    });
    /* A 200 is NOT proof the row was written. Apps Script answers 200 for a
       handler that threw, and the documented doPost returns {ok:true} only after
       appendRow succeeds. This matters because with Blob down this sink is the
       only thing keeping the endpoint's 200 honest. */
    if (!r.ok) return { ok: false, status: r.status };
    let body = null;
    try { body = await r.json(); }
    catch { return { ok: false, status: r.status, error: "unreadable reply" }; }
    if (body && body.ok === true) return { ok: true, status: r.status };
    return { ok: false, status: r.status, error: "sheet reported failure" };
  } catch (err) {
    console.error("sheet write failed:", errorCode(err));
    return { ok: false, error: "unreachable" };
  }
}

/* Read-merge-write, deliberately. A blind PATCH with { tags: ["founder-pilot"] }
   REPLACES the tag list, which would erase the attribution tags carried by the
   waitlist records this list is mostly made of. Same for metadata. */
async function toButtondown(app) {
  const key = process.env.BUTTONDOWN_API_KEY;
  if (!key) return { ok: false, skipped: true };

  const headers = { Authorization: "Token " + key, "Content-Type": "application/json" };
  const metadata = {
    intent: "founder-pilot-application",
    group: app.group,
    bracelets: String(app.bracelets),
    iphone_all: app.iphone_all,
    country: app.country,
    circle_countries: app.circle_countries,
    price_each: String(app.price_each),
    total: String(app.total),
    disclaimers: app.disclaimers,
    applied_at: app.applied_at,
  };

  const call = (path, init) => fetch(BUTTONDOWN_BASE + path, {
    ...init, headers, signal: AbortSignal.timeout(EXTERNAL_TIMEOUT),
  });

  try {
    const found = await call("/subscribers/" + encodeURIComponent(app.email), { method: "GET" });

    if (found.status === 404) {
      const created = await call("/subscribers", {
        method: "POST",
        body: JSON.stringify({ email_address: app.email, tags: [BUTTONDOWN_TAG], metadata }),
      });
      return { ok: created.ok, status: created.status, action: "created" };
    }

    if (!found.ok) return { ok: false, status: found.status, action: "lookup" };

    const existing = await found.json();
    const raw = Array.isArray(existing.tags) ? existing.tags : [];
    // Buttondown has returned tags as objects in some versions; keep names only.
    const names = raw.map((t) => (t && typeof t === "object" ? t.name : t)).filter(Boolean);
    if (!names.includes(BUTTONDOWN_TAG)) names.push(BUTTONDOWN_TAG);

    const updated = await call("/subscribers/" + encodeURIComponent(app.email), {
      method: "PATCH",
      body: JSON.stringify({
        tags: names,
        metadata: { ...(existing.metadata || {}), ...metadata },
      }),
    });
    return { ok: updated.ok, status: updated.status, action: "updated" };
  } catch (err) {
    console.error("buttondown failed:", errorCode(err));
    return { ok: false, error: "unreachable" };
  }
}

/* ---------- handler ----------------------------------------------------- */

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  /* Applications are CLOSED. The Founder Pilot was cancelled on 2026-09-11. Off
     unless APPLY_ENABLED is literally "true", so a stale deploy cannot start
     collecting applications for something that is not happening. */
  if ((process.env.APPLY_ENABLED || "").trim() !== "true") {
    return res.status(503).json({ error: "applications_closed" });
  }
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: "origin not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    if (body.length > MAX_BODY) return res.status(413).json({ error: "too large" });
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "unreadable body" }); }
  }
  if (!body || typeof body !== "object") return res.status(400).json({ error: "unreadable body" });

  const { error, application } = validate(body);
  if (error) return res.status(400).json({ error });

  // The application date the subscriber record cannot give you: a waitlist
  // signup from August keeps its August date forever.
  application.applied_at = new Date().toISOString();
  if (!application.source) {
    const ref = clean(req.headers.referer || req.headers.referrer, 120);
    if (ref) application.source = ref;
  }

  // 1. record of truth
  let stored = false;
  try {
    await put(keyFor(application.email), JSON.stringify(application, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,          // re-applying corrects, never duplicates
    });
    stored = true;
  } catch (err) {
    console.error("blob put failed:", errorCode(err));
  }

  // 2 and 3. the working surface and the mailing tag, in parallel; neither is
  // allowed to cost someone their application.
  const [sheet, buttondown] = await Promise.all([toSheet(application), toButtondown(application)]);
  if (sheet.ok) stored = true;

  if (!stored) {
    // Nothing durable happened. Say so, so the page can tell the truth and let
    // them try again, rather than thanking them for an application that is gone.
    return res.status(502).json({ error: "storage unavailable" });
  }

  return res.status(200).json({
    ok: true,
    stored: true,
    sheet: sheet.skipped ? "not configured" : sheet.ok ? "ok" : "failed",
    buttondown: buttondown.skipped ? "not configured" : buttondown.ok ? buttondown.action : "failed",
  });
}
