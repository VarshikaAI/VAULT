"use strict";
(() => {
  // src/content-main.ts
  function notifyBridge(payload) {
    window.postMessage({ source: "vault-main", payload }, "*");
    navigator.clipboard.readText = async function() {
      notifyBridge({ kind: "sensitive_api", api: "clipboard_read" });
      return originalReadText();
    };
  }
  var originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    notifyBridge({ kind: "sensitive_api", api: "canvas_fingerprint" });
    return originalToDataURL.apply(this, args);
  };
  function classifyField(el) {
    if (el.type === "password") return "credential";
    const autocomplete = (el.autocomplete || "").toLowerCase();
    if (autocomplete.includes("cc-")) return "payment_card";
    if (/^\d{3}-?\d{2}-?\d{4}$/.test(el.value)) return "government_id";
    return "generic_text";
  }
  document.addEventListener(
    "focusin",
    (e) => {
      const field = e.target;
      if (!(field instanceof HTMLInputElement)) return;
      const fieldType = classifyField(field);
      if (fieldType !== "credential" && fieldType !== "payment_card" && fieldType !== "government_id") {
        return;
      }
      notifyBridge({
        kind: "field_focus",
        fieldType
      });
    },
    true
  );
  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target;
      const sensitiveInput = form.querySelector(
        "input[type=password], input[autocomplete*='cc-']"
      );
      if (!sensitiveInput) return;
      e.preventDefault();
      const fieldType = classifyField(sensitiveInput);
      notifyBridge({ kind: "field_submit", fieldType });
      window.addEventListener("message", function handler(ev) {
        if (ev.data?.source !== "vault-verdict") return;
        window.removeEventListener("message", handler);
        const verdict = ev.data.payload;
        if (verdict.verdict === "ALLOW") {
          form.submit();
        } else {
          const proceed = window.confirm(`Vault: ${verdict.reason}

Send anyway?`);
          if (proceed) form.submit();
        }
      });
    },
    true
  );
})();
