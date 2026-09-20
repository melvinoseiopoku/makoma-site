/* Founder Pilot funnel. Optional telemetry: never blocks checkout, no form values,
   email addresses, order IDs, session secrets, or raw errors are collected here.
   Uses the same event queue as Vercel's browser track() implementation. */
(function () {
  "use strict";
  var seen = Object.create(null);
  var steps = ["way", "count", "iphone", "country", "size", "email", "agree", "price", "stop", "stopcountry"];
  var outcomes = ["confirmed", "processing", "not_completed", "unmatched", "unconfirmed"];
  var errors = ["sold_out", "not_open", "bad_request", "slow_down", "too_many_holds", "attempt_stale", "closed", "unavailable"];

  function emit(type, value) {
    try {
      if ((window.MAKOMA_PILOT || {}).mode !== "checkout") return;
      var name, data, key;
      if (type === "step" && steps.indexOf(value) !== -1) {
        name = "pilot_step_view"; data = { step: value }; key = type + ":" + value;
      } else if (type === "checkout" && (value === "start" || value === "ready")) {
        name = "pilot_checkout_" + value; data = {}; key = type + ":" + value;
      } else if (type === "payment" && outcomes.indexOf(value) !== -1) {
        name = "pilot_payment_result"; data = { status: value }; key = type + ":" + value;
      } else if (type === "error") {
        var reason = typeof value === "string" ? value.split(":")[0] : "unavailable";
        if (errors.indexOf(reason) === -1) reason = "unavailable";
        name = "pilot_checkout_error"; data = { reason: reason }; key = type + ":" + reason;
      } else { return; }
      // Once per page load: Back, price repaint, and retries do not inflate the funnel.
      if (seen[key]) return;
      window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
      window.va("event", { name: name, data: data });
      seen[key] = true;
    } catch (e) { /* Analytics must never interrupt a purchase. */ }
  }

  // Vercel attaches the current URL to telemetry. Strip checkout/payment references
  // from pageviews AND events, without touching the browser's actual return URL.
  function redact(event) {
    try {
      var clean = Object.assign({}, event), url = new URL(event.url, window.location.origin);
      url.search = ""; url.hash = ""; clean.url = url.toString();
      return clean;
    } catch (e) { return null; }
  }
  window.MakomaPilotAnalytics = { emit: emit };
  try {
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    window.va("beforeSend", redact);
  } catch (e) { /* Optional integration. */ }
})();
