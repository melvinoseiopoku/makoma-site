/* ============================================================
   M'AKOMA — seat reservations, the one indivisible operation the checkout needs
   ------------------------------------------------------------
   "Check availability and reserve" happens as ONE Redis script (Upstash, reached over
   REST from every Vercel instance), so two requests for the last seat cannot both win,
   nine requests from one address cannot all hold, and a retry of the same attempt finds
   its own reservation instead of taking another. Holds expire on the same clock as the
   Stripe session; paid orders are moved to a permanent hash and never expire.

   Keys (all under one namespace per Stripe mode, so a test rehearsal never touches live):
     <ns>:holds   hash   attempt -> seats        open reservations
     <ns>:expiry  zset   attempt -> expires ms   purged inside every script run
     <ns>:byip    hash   attempt -> ip hash      the per-address cap
     <ns>:paid    hash   attempt|session -> seats  permanent
     <ns>:session hash   session id -> attempt   so a release by session id finds its hold

   Without a store the function must not sell in production (see checkout.js). Locally,
   tools/pilot-dev.mjs runs the same interface in memory — atomic within one process,
   which is all a single-process rehearsal needs.
   ============================================================ */

const RESERVE = `
local holds, expiry, byip, paid = KEYS[1], KEYS[2], KEYS[3], KEYS[4]
local now, attempt, seats, cap, ttl, ip, ipmax = tonumber(ARGV[1]), ARGV[2], tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5]), ARGV[6], tonumber(ARGV[7])
local dead = redis.call('ZRANGEBYSCORE', expiry, '-inf', now)
for _, a in ipairs(dead) do redis.call('HDEL', holds, a); redis.call('HDEL', byip, a); redis.call('ZREM', expiry, a) end
local total = 0
for _, v in ipairs(redis.call('HVALS', holds)) do total = total + tonumber(v) end
for _, v in ipairs(redis.call('HVALS', paid)) do total = total + tonumber(v) end
if redis.call('HEXISTS', holds, attempt) == 1 or redis.call('HEXISTS', paid, attempt) == 1 then
  redis.call('ZADD', expiry, now + ttl, attempt)
  return {1, cap - total, 'reused'}
end
if ip ~= '' then
  local n = 0
  for _, v in ipairs(redis.call('HVALS', byip)) do if v == ip then n = n + 1 end end
  if n >= ipmax then return {0, cap - total, 'too_many_holds'} end
end
if total + seats > cap then return {0, cap - total, 'sold_out'} end
redis.call('HSET', holds, attempt, seats)
redis.call('ZADD', expiry, now + ttl, attempt)
if ip ~= '' then redis.call('HSET', byip, attempt, ip) end
return {1, cap - total - seats, 'reserved'}
`;

const COUNTS = `
local holds, expiry, byip, paid = KEYS[1], KEYS[2], KEYS[3], KEYS[4]
local now = tonumber(ARGV[1])
local dead = redis.call('ZRANGEBYSCORE', expiry, '-inf', now)
for _, a in ipairs(dead) do redis.call('HDEL', holds, a); redis.call('HDEL', byip, a); redis.call('ZREM', expiry, a) end
local h, p = 0, 0
for _, v in ipairs(redis.call('HVALS', holds)) do h = h + tonumber(v) end
for _, v in ipairs(redis.call('HVALS', paid)) do p = p + tonumber(v) end
return {h, p}
`;

function keys(ns) { return [ns + ":holds", ns + ":expiry", ns + ":byip", ns + ":paid", ns + ":session"]; }

/* ---------- Upstash over REST: one HTTP round trip per operation ---------- */
function upstash(url, token, ns) {
  const K = keys(ns);
  async function call(cmd) {
    const r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error("store: " + (j.error || r.status));
    return j.result;
  }
  async function pipeline(cmds) {
    const r = await fetch(url.replace(/\/$/, "") + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
    const j = await r.json();
    if (!r.ok || !Array.isArray(j)) throw new Error("store: pipeline " + r.status);
    const bad = j.find((x) => x && x.error); if (bad) throw new Error("store: " + bad.error);
    return j.map((x) => x.result);
  }
  return {
    kind: "upstash",
    async reserve({ attempt, seats, ip, cap, ttlMs, now }) {
      const [ok, left, reason] = await call(["EVAL", RESERVE, 4, K[0], K[1], K[2], K[3], String(now), attempt, String(seats), String(cap), String(ttlMs), ip || "", "3"]);
      return { ok: Number(ok) === 1, left: Math.max(0, Number(left)), reason: String(reason) };
    },
    async counts(now) { const [h, p] = await call(["EVAL", COUNTS, 4, K[0], K[1], K[2], K[3], String(now)]); return { holds: Number(h), paid: Number(p) }; },
    async attach(attempt, sessionId) { await call(["HSET", K[4], sessionId, attempt]); },
    async attemptOf(sessionId) { return (await call(["HGET", K[4], sessionId])) || null; },
    async release(attempt) { await pipeline([["HDEL", K[0], attempt], ["HDEL", K[2], attempt], ["ZREM", K[1], attempt]]); },
    async markPaid(entries) {   // [{key, seats}] — permanent, and no longer a hold
      if (!entries.length) return;
      /* Paid orders are re-synced from Stripe on EVERY request. Rewriting all of them
         would cost four commands per paid order per request (sixty orders: 240 commands
         each time someone presses Checkout), which is what Upstash bills and what the
         free plan caps. One HKEYS first; only orders the ledger has not seen are written. */
      const known = new Set(await call(["HKEYS", K[3]]));
      const fresh = entries.filter((e) => !known.has(e.key));
      if (!fresh.length) return;
      const cmds = [];
      for (const e of fresh) cmds.push(["HSET", K[3], e.key, String(e.seats)], ["HDEL", K[0], e.key], ["HDEL", K[2], e.key], ["ZREM", K[1], e.key]);
      await pipeline(cmds);
    },
  };
}

/* ---------- in-memory twin, for tools/pilot-dev.mjs only ---------- */
function memory(ns) {
  const holds = new Map(), byip = new Map(), expiry = new Map(), paid = new Map(), session = new Map();
  const purge = (now) => { for (const [a, t] of expiry) if (t <= now) { holds.delete(a); byip.delete(a); expiry.delete(a); } };
  const sum = (m) => { let n = 0; for (const v of m.values()) n += v; return n; };
  return {
    kind: "memory",
    async reserve({ attempt, seats, ip, cap, ttlMs, now }) {
      purge(now);
      const total = sum(holds) + sum(paid);
      if (holds.has(attempt) || paid.has(attempt)) { expiry.set(attempt, now + ttlMs); return { ok: true, left: Math.max(0, cap - total), reason: "reused" }; }
      if (ip) { let n = 0; for (const v of byip.values()) if (v === ip) n++; if (n >= 3) return { ok: false, left: Math.max(0, cap - total), reason: "too_many_holds" }; }
      if (total + seats > cap) return { ok: false, left: Math.max(0, cap - total), reason: "sold_out" };
      holds.set(attempt, seats); expiry.set(attempt, now + ttlMs); if (ip) byip.set(attempt, ip);
      return { ok: true, left: Math.max(0, cap - total - seats), reason: "reserved" };
    },
    async counts(now) { purge(now); return { holds: sum(holds), paid: sum(paid) }; },
    async attach(attempt, sessionId) { session.set(sessionId, attempt); },
    async attemptOf(sessionId) { return session.get(sessionId) || null; },
    async release(attempt) { holds.delete(attempt); byip.delete(attempt); expiry.delete(attempt); },
    async markPaid(entries) { for (const e of entries) { paid.set(e.key, e.seats); holds.delete(e.key); byip.delete(e.key); expiry.delete(e.key); } },
  };
}

let memo = null;
/* The store for this process. ns separates Stripe test and live data inside one Upstash
   database. Returns null when nothing is configured in production. */
export function getStore(stripeKey) {
  if (memo) return memo;
  const mode = /^(sk|rk)_test_/.test(String(stripeKey || "")) ? "test" : "live";
  const ns = "pilot:" + mode;
  /* The Vercel Marketplace names the variables <PREFIX>_REST_API_URL / _TOKEN with a
     prefix chosen at connect time (KV by default). Accept the Upstash names, the KV
     names, and any other prefix, never the READ_ONLY token. */
  const anyPrefixed = (suffix) => { for (const k of Object.keys(process.env)) if (k.endsWith(suffix) && !/READ_ONLY/.test(k) && process.env[k]) return process.env[k]; return ""; };
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || anyPrefixed("_REST_API_URL");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || anyPrefixed("_REST_API_TOKEN");
  if (url && token) memo = upstash(url, token, ns);
  else if (!process.env.VERCEL) { console.warn("[reservations] no Upstash configured: using the in-memory store (rehearsal only)"); memo = memory(ns); }
  else memo = null;
  return memo;
}
