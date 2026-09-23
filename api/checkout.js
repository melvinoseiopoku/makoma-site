/* ============================================================
   M'AKOMA — Founder Pilot checkout (Vercel Function + Stripe Checkout, embedded)
   ------------------------------------------------------------
   The landing page (index.html) walks the buyer through the decisions and POSTs them
   here. Stripe's embedded Checkout then mounts INTO the page and asks only for card,
   address and phone. Card data never touches the site.

     POST /api/checkout  {answers, attempt}  -> { clientSecret, left, total }  (new session)
     POST /api/checkout  {expire: "cs_..."}  -> { ok }   (the page abandoned that session)
     GET  /api/checkout?session_id=cs_...    -> { status, paymentStatus, bracelets }
     GET  /api/checkout?seats=1              -> { left, total }
     GET  /api/checkout?price=1              -> { unitAmount, currency }   (Stripe holds the amount)

   Environment (Vercel project -> Settings -> Environment Variables; redeploy after changes):
     PILOT_SALES_ENABLED   literally "true" or nothing sells (session status lookups still work)
     STRIPE_SECRET_KEY     rk_live_... restricted: Checkout Sessions WRITE + Prices READ
     STRIPE_PRICE_ID       price_... one-time price; the amount lives only in Stripe
     PILOT_OPENS_AT        2026-09-20T12:00:00-04:00 (with the offset; fails closed if missing)
     PILOT_SHIP_WINDOW     "by 25 October 2026" — shown on the pay button; must match the pages
     PILOT_SEATS           whole number, default 60; anything else fails closed
     UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   the reservation store (Vercel → Storage →
                           Upstash Redis, connected to the project; KV_REST_API_* also accepted).
                           REQUIRED in production: without it the function refuses to sell.
     STRIPE_SHIPPING_RATE_ID / STRIPE_AUTOMATIC_TAX=1 / STRIPE_TERMS_CONSENT=1   optional

   INVENTORY. "Check availability and reserve" is ONE atomic operation in the store
   (lib/reservations.js), done BEFORE the Stripe session exists, keyed by the page's attempt
   id. So two requests for the last seat cannot both win, a retry of the same attempt finds
   its own reservation, and the per-address cap is enforced in the same operation. Holds
   expire on the same clock as the Stripe session (30 minutes, plus a margin) and are purged
   inside every store operation. Paid orders are moved to a permanent hash: every request
   first reads Stripe's list of completed sessions and records any paid order it has not
   seen (so a buyer who pays and never returns to the page still counts), and the return
   page's status lookup does the same the moment it sees "paid". Stripe is the ledger of
   money; the store is the ledger of seats; Stripe never needs to be expired to keep the
   count right, only to tidy up a hold the page has abandoned.

   ATTEMPTS. The page mints "t<ms base36>-<random>" per set of answers. It is the store's
   reservation key and Stripe's idempotency key. Ordering no longer matters, so the only
   parameter derived from the attempt is the acknowledgement time; expires_at is server
   time. If Stripe reports the key in use (a concurrent duplicate) or a parameter mismatch
   (a slow retry), the function waits for the original session to appear and hands it back;
   if it still has not, it answers 409 attempt_pending and the page retries the SAME
   attempt. An attempt never changes identity because of a slow reply.
   ============================================================ */

import Stripe from "stripe";
import { createHash } from "node:crypto";
import { getStore } from "../lib/reservations.js";

const ALLOWED_ORIGINS = [
  "https://makoma.io",
  "https://www.makoma.io",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
];
const OFFER = "founder-pilot";
const TERMS_VERSION = "2026-09-19";          // the refunds, shipping and terms pages as published
const HOLD_MINUTES = 30;                     // Stripe's minimum Checkout Session lifetime
const HOLD_MARGIN_MS = 90 * 1000;            // the store hold outlives the Stripe session slightly
const SIZES = { small: "Small", medium: "Medium", large: "Large" };
const ACKNOWLEDGED = "proto,water,weekly-feedback";   // the three checkboxes on the page
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const h = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (ALLOWED_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Vary"] = "Origin";
  }
  return h;
}
function send(res, status, headers, body) {
  res.statusCode = status;
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}
const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const ipHash = (ip) => (ip ? createHash("sha256").update("makoma-pilot|" + ip).digest("hex").slice(0, 16) : "");

/* PILOT_SEATS: a positive whole number or the function refuses to sell. */
function parseSeats(raw) {
  const t = (raw == null || String(raw).trim() === "") ? "60" : String(raw).trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= 1 ? n : null;
}
/* "t<ms base36>-<random>": the page's attempt id. Its clock is only used for the
   acknowledgement timestamp, so it is accepted within a day of ours. */
function parseAttempt(raw) {
  const m = /^t([0-9a-z]{6,10})-([a-z0-9]{6,16})$/.exec(String(raw || ""));
  if (!m) return null;
  const ms = parseInt(m[1], 36);
  if (!(ms > 0) || Math.abs(Date.now() - ms) > 24 * 60 * 60 * 1000) return null;
  return { id: m[0], ms };
}

/* Stripe's view of this offer's sessions: one list call. Used to record paid orders in
   the store and to find a session by attempt (a retry, a concurrent duplicate). */
function seatsOf(s) {
  const li = (s.line_items && s.line_items.data) || [];
  const q = li.reduce((n, x) => n + (x.quantity || 0), 0);
  return q || Number(s.metadata && s.metadata.bracelets) || 1;
}
async function snapshot(stripe, sinceSec) {
  const out = [];
  const params = { limit: 100, expand: ["data.line_items"] };
  if (sinceSec) params.created = { gte: sinceSec };
  for await (const s of stripe.checkout.sessions.list(params)) {
    if (!s.metadata || s.metadata.offer !== OFFER) continue;
    out.push({ id: s.id, status: s.status, paid: s.payment_status === "paid" || s.payment_status === "no_payment_required", seats: seatsOf(s), attempt: s.metadata.attempt || "" });
  }
  return out;
}
const paidEntries = (snap) => snap.filter((h) => h.status === "complete" && h.paid).map((h) => ({ key: h.attempt || h.id, seats: h.seats }));

/* Best-effort abuse brake, per function instance. The cross-instance cap lives in the store. */
const recent = new Map();
function rateLimited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 8;
  const arr = (recent.get(ip) || []).filter((t) => now - t < win);
  arr.push(now); recent.set(ip, arr);
  if (recent.size > 5000) recent.clear();
  return arr.length > max;
}

/* The page's answers. Every rejection names the field; nothing is trusted. */
function readAnswers(body) {
  const b = body && typeof body === "object" ? body : {};
  const way = b.way === "circle" ? "circle" : b.way === "single" ? "single" : "";
  if (!way) return { ok: false, detail: "circle or single" };
  const count = way === "circle" ? parseInt(b.count, 10) : 1;
  if (!(count >= 1 && count <= 7)) return { ok: false, detail: "how many bracelets" };   // six beads plus the wearer
  if (b.iphone !== "yes") return { ok: false, detail: "an iPhone is required" };
  if (clip(b.country, 40) !== "United States") return { ok: false, detail: "this batch ships to US addresses only" };
  const sizes = Array.isArray(b.sizes) ? b.sizes.map((v) => clip(v, 10)) : [];
  if (sizes.length !== count || sizes.some((v) => !SIZES[v])) return { ok: false, detail: "a wrist size for every bracelet" };
  const email = clip(b.email, 120).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, detail: "a real email" };
  if (b.agree !== true) return { ok: false, detail: "the three acknowledgements" };
  const attempt = parseAttempt(b.attempt);
  if (!attempt) return { ok: false, detail: "attempt" };
  const replaces = /^cs_[A-Za-z0-9_]+$/.test(String(b.replaces || "")) ? String(b.replaces) : "";
  return { ok: true, a: { way, count, sizes, email, attempt: attempt.id, attemptMs: attempt.ms, replaces, source: clip(b.source, 60) } };
}

export default async function handler(req, res) {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return send(res, 204, headers, {});

  const key = process.env.STRIPE_SECRET_KEY, price = process.env.STRIPE_PRICE_ID;
  if (!key || !price) return send(res, 503, headers, { error: "not_configured" });
  const stripe = new Stripe(key);
  const store = getStore(key);
  const salesOn = (process.env.PILOT_SALES_ENABLED || "").trim() === "true";
  const total = parseSeats(process.env.PILOT_SEATS);
  const opensAt = Date.parse((process.env.PILOT_OPENS_AT || "").trim());
  const sinceSec = Number.isNaN(opensAt) ? undefined : Math.floor(opensAt / 1000) - 30 * 86400;
  const holdMs = HOLD_MINUTES * 60 * 1000 + HOLD_MARGIN_MS;

  try {
    if (req.method === "GET") {
      const q = req.query || {};
      if (q.session_id) {
        /* A buyer coming back from Stripe must always get an answer, sales open or not. */
        const sid = String(q.session_id);
        if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return send(res, 400, headers, { error: "bad_session" });
        const s = await stripe.checkout.sessions.retrieve(sid);
        if (!s.metadata || s.metadata.offer !== OFFER) return send(res, 404, headers, { error: "not_found" });
        const paid = s.payment_status === "paid" || s.payment_status === "no_payment_required";
        if (paid && store) { try { await store.markPaid([{ key: s.metadata.attempt || s.id, seats: seatsOf(s) }]); } catch (e) { console.error("store markPaid failed", e && e.message); } }
        return send(res, 200, headers, {
          status: s.status, paymentStatus: s.payment_status,
          bracelets: Number(s.metadata.bracelets) || 1, amountTotal: s.amount_total, currency: s.currency,
        });
      }
      if (!salesOn) return send(res, 503, headers, { error: "sales_closed" });
      if (q.price) {
        const pr = await stripe.prices.retrieve(price);
        return send(res, 200, headers, { unitAmount: pr.unit_amount, currency: pr.currency, livemode: pr.livemode === true });   // livemode: so a pre-launch probe can tell a practice key/price from the real ones
      }
      if (total === null) return send(res, 503, headers, { error: "not_configured", detail: "PILOT_SEATS must be a positive whole number" });
      if (!store) return send(res, 503, headers, { error: "not_configured", detail: "reservation store" });
      await store.markPaid(paidEntries(await snapshot(stripe, sinceSec)));
      const c = await store.counts(Date.now());
      return send(res, 200, headers, { left: Math.max(0, total - c.holds - c.paid), total });
    }

    if (req.method !== "POST") return send(res, 405, headers, { error: "method" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body && typeof body === "object" ? body : {};

    /* The page abandoned a session (the buyer changed the order): release it now. Only
       open sessions of this offer, by id. A Stripe failure here is a 502, never a false ok. */
    if (body.expire) {
      const sid = String(body.expire);
      if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return send(res, 400, headers, { error: "bad_session" });
      const s = await stripe.checkout.sessions.retrieve(sid);
      if (!s.metadata || s.metadata.offer !== OFFER) return send(res, 404, headers, { error: "not_found" });
      if (s.status === "open") await stripe.checkout.sessions.expire(sid);
      if (store && s.status !== "complete") { try { await store.release(s.metadata.attempt || (await store.attemptOf(sid)) || sid); } catch (e) { console.error("store release failed", e && e.message); } }
      return send(res, 200, headers, { ok: true, status: s.status === "open" ? "expired" : s.status });
    }

    /* MASTER SWITCH. Sales are OFF unless this is literally "true". */
    if (!salesOn) return send(res, 503, headers, { error: "sales_closed" });
    if (total === null) return send(res, 503, headers, { error: "not_configured", detail: "PILOT_SEATS must be a positive whole number" });
    if (!store) return send(res, 503, headers, { error: "not_configured", detail: "reservation store" });   // never sell without the atomic ledger

    const read = readAnswers(body);
    if (!read.ok) return send(res, 400, headers, { error: "bad_request", detail: read.detail });
    const a = read.a;

    const rawIp = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
    if (rawIp && rateLimited(rawIp)) return send(res, 429, headers, { error: "slow_down" });
    const ip = ipHash(rawIp);

    const window = (process.env.PILOT_SHIP_WINDOW || "").trim();
    if (!window) return send(res, 503, headers, { error: "not_configured", detail: "PILOT_SHIP_WINDOW is not set" });
    if (Number.isNaN(opensAt)) return send(res, 503, headers, { error: "not_configured", detail: "PILOT_OPENS_AT missing or unparseable" });
    if (Date.now() < opensAt) return send(res, 409, headers, { error: "not_open", opensAt: new Date(opensAt).toISOString() });

    /* Stripe's view first: record any paid order the store has not seen, and find this
       attempt's session if it already exists (a retry after a lost reply). */
    const snap = await snapshot(stripe, sinceSec);
    await store.markPaid(paidEntries(snap));
    const findMine = async (list) => {
      const same = list.find((h) => h.status === "open" && h.attempt === a.attempt);
      if (!same) return null;
      const s2 = await stripe.checkout.sessions.retrieve(same.id);
      return s2.status === "open" && s2.client_secret ? s2 : null;
    };
    const leftNow = async () => { const c = await store.counts(Date.now()); return Math.max(0, total - c.holds - c.paid); };
    /* An attempt whose session already closed (expired, or paid) cannot be created again
       under the same idempotency key: tell the page to mint a new attempt. */
    if (snap.some((h) => h.attempt === a.attempt && h.status !== "open")) return send(res, 409, headers, { error: "attempt_spent" });
    const again = await findMine(snap);
    if (again) {
      await store.reserve({ attempt: a.attempt, seats: a.count, ip, cap: total, ttlMs: holdMs, now: Date.now() });   // re-arms the hold if it had lapsed; a reused key never double-counts
      return send(res, 200, headers, { clientSecret: again.client_secret, left: await leftNow(), total, reused: true });
    }

    /* The page says which session it is replacing (the buyer changed the order). Knowing
       the id is the proof of ownership. If Stripe cannot expire it, the old hold stays and
       the new one is not made: two payable forms are worse than one retry. */
    if (a.replaces) {
      const old = snap.find((h) => h.id === a.replaces && h.status === "open");
      if (old) {
        await stripe.checkout.sessions.expire(old.id);   // throws -> 502 below, hold untouched
        await store.release(old.attempt || old.id);
      }
    }

    /* THE reservation: one atomic operation, before Stripe knows anything. */
    const r = await store.reserve({ attempt: a.attempt, seats: a.count, ip, cap: total, ttlMs: holdMs, now: Date.now() });
    if (!r.ok) {
      if (r.reason === "too_many_holds") return send(res, 429, headers, { error: "too_many_holds" });
      return send(res, 409, headers, { error: "sold_out", left: r.left, total });
    }

    const origin = ALLOWED_ORIGINS.includes(req.headers.origin || "") ? req.headers.origin : "https://makoma.io";
    const submitMsg = (a.count > 1 ? a.count + " bracelets, one order, one address. " : "") + "Ships in waves " + window + ". Fully refundable until it ships. Hand-built pilot hardware, not the retail edition. iPhone required.";
    const meta = {
      offer: OFFER, attempt: a.attempt, ip, way: a.way, bracelets: String(a.count),
      sizes: clip(a.sizes.map((v, i) => (a.count > 1 ? (i === 0 ? "You" : "P" + (i + 1)) + ": " : "") + SIZES[v]).join("; "), 500),
      colour: "black", email: a.email, source: a.source,
      acknowledged: ACKNOWLEDGED, terms_version: TERMS_VERSION, acknowledged_at: new Date(a.attemptMs).toISOString(),
    };
    const params = {
      ui_mode: "embedded",
      mode: "payment",
      line_items: [{ price, quantity: a.count }],
      customer_email: a.email,
      /* Card only (Apple Pay and Google Pay ride on card): every other method settles
         asynchronously, and a seat cannot wait days to learn whether it was paid. */
      payment_method_types: ["card"],
      return_url: origin + "/preorder?session_id={CHECKOUT_SESSION_ID}",   // the flow moved to /preorder on 2026-09-23; / forwards old returns
      metadata: meta,
      payment_intent_data: { metadata: meta },
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ["US"] },
      custom_text: { submit: { message: submitMsg.slice(0, 1190) } },
      expires_at: Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60 + 60,
    };
    /* Stripe's own "I agree to the terms" tick. Stripe REFUSES the session unless the Terms
       of Service URL is set under Business > Public details, so it is opt-in. */
    if (process.env.STRIPE_TERMS_CONSENT === "1") params.consent_collection = { terms_of_service: "required" };
    if (process.env.STRIPE_SHIPPING_RATE_ID) params.shipping_options = [{ shipping_rate: process.env.STRIPE_SHIPPING_RATE_ID }];
    if (process.env.STRIPE_AUTOMATIC_TAX === "1") params.automatic_tax = { enabled: true };

    let session;
    try {
      session = await stripe.checkout.sessions.create(params, { idempotencyKey: "pilot-" + a.attempt });
    } catch (e) {
      const conflict = e && (e.code === "idempotency_key_in_use" || e.type === "StripeIdempotencyError");
      if (!conflict) { try { await store.release(a.attempt); } catch (e2) { /* the hold lapses on its own */ } throw e; }
      /* The same attempt is being created by another request right now, or was created
         with slightly different parameters by a slow retry. Wait for it to show up and
         hand THAT session back; the reservation is shared with it. */
      for (let i = 0; i < 8; i++) {
        await sleep(500);
        const list = await snapshot(stripe, sinceSec);
        if (list.some((h) => h.attempt === a.attempt && h.status !== "open")) { try { await store.release(a.attempt); } catch (e2) {} return send(res, 409, headers, { error: "attempt_spent" }); }
        const found = await findMine(list);
        if (found) { await store.attach(a.attempt, found.id); return send(res, 200, headers, { clientSecret: found.client_secret, left: await leftNow(), total, reused: true }); }
      }
      return send(res, 409, headers, { error: "attempt_pending" });   // the page keeps the attempt and asks again
    }
    await store.attach(a.attempt, session.id);
    return send(res, 200, headers, { clientSecret: session.client_secret, left: await leftNow(), total });
  } catch (err) {
    console.error("checkout failed:", (err && err.name) || "error", (err && err.type) || "", (err && err.code) || "", (err && err.message) || "");
    return send(res, 502, headers, { error: "stripe_error" });
  }
}
