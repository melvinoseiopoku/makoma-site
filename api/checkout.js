/* ============================================================
   M'AKOMA — Founder Pilot checkout (Vercel Function + Stripe Checkout, embedded)
   ------------------------------------------------------------
   The Founder Pilot page sells sixty hand-built bracelets. Payment happens ON the
   page: Stripe's embedded Checkout mounts into the landing page (index.html), and this
   function creates the session it needs. Stripe holds the card data; the site
   never sees it.

     POST /api/checkout                    -> { clientSecret }         (new session)
     GET  /api/checkout?session_id=cs_...  -> { status, paymentStatus, email }
     GET  /api/checkout?seats=1            -> { left, total }

   Environment (Vercel project → Settings → Environment Variables):
     STRIPE_SECRET_KEY          sk_live_... (a restricted key with Checkout Sessions
                                write + read is enough)
     STRIPE_PRICE_ID            price_... for the Founder Pilot bracelet. Stripe holds
                                the amount; it is deliberately not written down here,
                                because this file ships to a public repo.
     STRIPE_SHIPPING_RATE_ID    shr_... (optional) outbound shipping charged at checkout
     STRIPE_AUTOMATIC_TAX       "1" to let Stripe Tax add sales tax (needs Stripe Tax
                                enabled and an origin address in the dashboard)
     PILOT_SEATS                total paid seats, default 60
     PILOT_SHIP_WINDOW          e.g. "between 15 November and 20 December 2026". Shown
                                to the buyer at checkout. SET THIS BEFORE GOING LIVE:
                                a stated window is what makes the sale honest.

   Without STRIPE_SECRET_KEY and STRIPE_PRICE_ID the function answers 503 and the
   page falls back to an email capture, so nothing here can half-work in public.

   Seat cap: Stripe has no inventory for Checkout, so the cap is enforced by
   counting completed sessions tagged metadata.offer = "founder-pilot". Sixty is
   small enough that one list call covers it.
   ============================================================ */

import Stripe from "stripe";

const ALLOWED_ORIGINS = [
  "https://makoma.io",
  "https://www.makoma.io",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
];
const OFFER = "founder-pilot";

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

/* A seat is taken by a PAID session or by an OPEN one (a shopper mid-checkout). Open
   sessions expire 30 minutes after creation (expires_at below), so an abandoned checkout
   gives its seat back without a database. Returns the reserving sessions, oldest first. */
async function reservations(stripe) {
  const held = [];
  for await (const s of stripe.checkout.sessions.list({ status: "complete", limit: 100 })) {
    if (s.metadata && s.metadata.offer === OFFER && s.payment_status === "paid") held.push(s);
  }
  for await (const s of stripe.checkout.sessions.list({ status: "open", limit: 100 })) {
    if (s.metadata && s.metadata.offer === OFFER) held.push(s);
  }
  held.sort((a, b) => (a.created - b.created) || (a.id < b.id ? -1 : 1));
  return held;
}
async function seatsTaken(stripe) { return (await reservations(stripe)).length; }

export default async function handler(req, res) {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return send(res, 204, headers, {});

  /* MASTER SWITCH. Sales are OFF unless this is literally "true". The pilot was
     cancelled on 2026-09-11 and no bracelet is being sold or shipped. This exists
     so no combination of leftover configuration can take someone's money. */
  if ((process.env.PILOT_SALES_ENABLED || "").trim() !== "true") {
    return send(res, 503, headers, { error: "sales_closed" });
  }

  const key = process.env.STRIPE_SECRET_KEY, price = process.env.STRIPE_PRICE_ID;
  if (!key || !price) return send(res, 503, headers, { error: "not_configured" });
  const stripe = new Stripe(key);
  const total = Math.max(1, parseInt(process.env.PILOT_SEATS || "60", 10));

  try {
    if (req.method === "GET") {
      const q = req.query || {};
      if (q.session_id) {
        if (!/^cs_[A-Za-z0-9_]+$/.test(String(q.session_id))) return send(res, 400, headers, { error: "bad_session" });
        const s = await stripe.checkout.sessions.retrieve(String(q.session_id));
        return send(res, 200, headers, {
          status: s.status, paymentStatus: s.payment_status,
          email: (s.customer_details && s.customer_details.email) || null,
        });
      }
      const taken = await seatsTaken(stripe);
      return send(res, 200, headers, { left: Math.max(0, total - taken), total });
    }

    if (req.method !== "POST") return send(res, 405, headers, { error: "method" });

    const taken = await seatsTaken(stripe);
    if (taken >= total) return send(res, 409, headers, { error: "sold_out", left: 0, total });

    // The page promises the ship window BEFORE payment, so a checkout without one is a bug, not a fallback.
    const window = (process.env.PILOT_SHIP_WINDOW || "").trim();
    if (!window) return send(res, 503, headers, { error: "not_configured", detail: "PILOT_SHIP_WINDOW is not set" });

    /* The countdown is presentation only. Anyone can POST straight here, so the
       opening moment is enforced server-side too. PILOT_OPENS_AT must carry an
       offset: 2026-09-20T12:00:00-04:00, because New York is on DAYLIGHT time
       that day and -05:00 would open an hour late. */
    const opensAt = Date.parse((process.env.PILOT_OPENS_AT || "").trim());
    if (Number.isNaN(opensAt)) {
      /* FAIL CLOSED. The previous form of this check skipped the gate entirely
         when PILOT_OPENS_AT was missing or malformed, so a misconfigured deploy
         would sell from the very first request. A gate that only works when it
         is configured is not a gate. */
      return send(res, 503, headers, { error: "not_configured", detail: "PILOT_OPENS_AT missing or unparseable" });
    }
    if (Date.now() < opensAt) {
      return send(res, 409, headers, { error: "not_open", opensAt: new Date(opensAt).toISOString() });
    }

    const origin = ALLOWED_ORIGINS.includes(req.headers.origin || "") ? req.headers.origin : "https://makoma.io";
    const submitMsg = "Ships in waves " + window + ". Fully refundable until it ships. Hand-built pilot hardware, not the retail edition. iPhone required.";

    const params = {
      ui_mode: "embedded",
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      return_url: origin + "/?session_id={CHECKOUT_SESSION_ID}",
      metadata: { offer: OFFER },
      payment_intent_data: { metadata: { offer: OFFER } },
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ["US"] },
      custom_fields: [
        { key: "wrist", label: { type: "custom", custom: "Wrist size, around the wrist bone (cm or in)" }, type: "text", text: { minimum_length: 2, maximum_length: 24 } },
        { key: "iphone", label: { type: "custom", custom: "Your iPhone" }, type: "dropdown", dropdown: { options: [
          { label: "iPhone 17 / 17 Pro", value: "17" }, { label: "iPhone 16 / 16 Pro", value: "16" },
          { label: "iPhone 15 / 15 Pro", value: "15" }, { label: "iPhone 14 or older", value: "14" } ] } },
        { key: "partner", label: { type: "custom", custom: "Email of the person you'll carry first (optional)" }, type: "text", optional: true, text: { maximum_length: 120 } },
      ],
      custom_text: { submit: { message: submitMsg.slice(0, 1190) } },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,   // Stripe's minimum; an abandoned checkout frees its seat
    };
    if (process.env.STRIPE_SHIPPING_RATE_ID) params.shipping_options = [{ shipping_rate: process.env.STRIPE_SHIPPING_RATE_ID }];
    if (process.env.STRIPE_AUTOMATIC_TAX === "1") params.automatic_tax = { enabled: true };

    const session = await stripe.checkout.sessions.create(params);
    // Two shoppers can pass the count above at the same instant. Recount with this session
    // included and rank by creation time: whoever holds a seat beyond the cap loses theirs,
    // deterministically, before they can pay.
    const held = await reservations(stripe);
    const rank = held.findIndex((s) => s.id === session.id);
    if (rank < 0 || rank >= total) {
      try { await stripe.checkout.sessions.expire(session.id); } catch (e) { /* already expired or complete */ }
      return send(res, 409, headers, { error: "sold_out", left: 0, total });
    }
    return send(res, 200, headers, { clientSecret: session.client_secret, left: Math.max(0, total - held.length), total });
  } catch (err) {
    /* Never hand Stripe's own message to a visitor: it can quote back the request,
       including values you did not intend to publish. Log a code, return nothing. */
    console.error("checkout failed:", (err && err.name) || "error", (err && err.type) || "");
    return send(res, 502, headers, { error: "stripe_error" });
  }
}
