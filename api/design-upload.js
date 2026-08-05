/* ============================================================
   M'AKOMA — design upload endpoint (Vercel Function + Vercel Blob)
   ------------------------------------------------------------
   The designer lets a visitor trace their own artwork onto a bead. That traced
   SVG runs to a few hundred KB, which cannot ride along in a Buttondown
   subscriber metadata field — so it is stored here and the signup carries only
   the short pathname.

     POST /api/design-upload    body = the traced SVG as text/plain
                                -> { ok: true, key }

   Same origin as the site on makoma.io, so the normal path involves no CORS at
   all. The allowlist below exists only for the github.io mirror and local dev.

   THE BLOB STORE MUST BE CREATED AS **PRIVATE**. An SVG is executable content:
   served from a public origin it is an XSS vector, and these are customer files
   we do not want indexed. `access: 'private'` below asserts that in code, but it
   does not override how the store itself was created — see README.

   Body parsing: Vercel's Node helpers populate `req.body` from the Content-Type,
   and `text/plain` yields a plain string. `image/svg+xml` is NOT in that table
   and would arrive undefined, so the client deliberately posts text/plain — which
   also keeps the request CORS-simple and avoids a preflight.
   ============================================================ */

import { put } from "@vercel/blob";

const MAX_CHARS = 300 * 1024;   // the tracer refuses >280 KB; this is the hard ceiling
const ALLOWED_ORIGINS = [
  "https://makoma.io",
  "https://www.makoma.io",
  "https://melvinoseiopoku.github.io",
  "http://127.0.0.1:8158",
  "http://localhost:8158",
];

/* Only what the tracer actually emits: an <svg> carrying nothing but xmlns and a
   numeric viewBox, wrapping bare <path d="..."/>. Everything else is REJECTED
   rather than sanitised — a rewriter that is 99% right is a vulnerability, and we
   control the producer. The opening tag is checked as an allowlist because merely
   looking for a viewBox inside it accepts `<svg viewBox="0 0 9 9" onload="...">`. */
function looksLikeTracedSvg(s) {
  if (typeof s !== "string" || !s.length) return "empty";

  const open = /^<svg((?:\s+[a-zA-Z:]+="[^"]*")*)\s*>/.exec(s);
  if (!open) return "not a traced svg";
  const seen = {};
  for (const [, name, value] of open[1].matchAll(/\s+([a-zA-Z:]+)="([^"]*)"/g)) {
    if (name !== "xmlns" && name !== "viewBox") return "unexpected attribute: " + name;
    if (seen[name]) return "duplicate attribute: " + name;
    seen[name] = value;
  }
  if (!seen.viewBox || !/^[-\d.\s]+$/.test(seen.viewBox)) return "not a traced svg";
  if (!/<\/svg>\s*$/.test(s)) return "truncated";

  const body = s.replace(/^<svg\s[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const rest = body.replace(/<path\s+d="[-\d.,\seMmZzLlHhVvCcSsQqTtAa]*"\s*\/>/g, "").trim();
  if (rest.length) return "unexpected markup";
  if (!/<path\s/.test(body)) return "no paths";
  return null;
}

// FNV-1a. Must stay identical to uploadTag() in js/design.js so the stored object
// and the tag shown in the signup email line up. Not a security hash — a label.
function tag(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

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

  // A cross-origin POST from an origin we do not know is refused. A SAME-origin
  // request sends no Origin header on some browsers, so an absent one is allowed.
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: "origin not allowed" });
  }

  let svg;
  try {
    svg = typeof req.body === "string" ? req.body : String(req.body ?? "");
  } catch {
    return res.status(400).json({ error: "unreadable body" });
  }
  if (svg.length > MAX_CHARS) return res.status(413).json({ error: "too large" });

  const bad = looksLikeTracedSvg(svg);
  if (bad) return res.status(400).json({ error: "rejected", reason: bad });

  const key = `designs/${new Date().toISOString().slice(0, 10)}/${tag(svg)}.svg`;

  try {
    // allowOverwrite because the name is a hash of the content: the same artwork
    // uploaded twice is the same file, which should be idempotent, not an error.
    const blob = await put(key, svg, {
      access: "private",
      contentType: "image/svg+xml",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.status(200).json({ ok: true, key: blob.pathname });
  } catch (err) {
    // Most likely cause: the Blob store has not been created, so there is no
    // BLOB_READ_WRITE_TOKEN. The client treats this as "unsent" and the signup
    // still completes — losing the artwork must never cost someone their signup.
    console.error("blob put failed:", err && err.message);
    return res.status(502).json({ error: "storage unavailable" });
  }
}
