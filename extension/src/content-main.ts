// Runs in the PAGE's own JS context (manifest "world": "MAIN") so it can
// override real globals before the page's own scripts run. This context has
// no access to chrome.* APIs — everything is relayed to content-bridge.ts
// (which runs in the isolated world) via window.postMessage.

function notifyBridge(payload: unknown) {
  window.postMessage({ source: "vault-main", payload }, "*");
  navigator.clipboard.readText = async function () {
    notifyBridge({ kind: "sensitive_api", api: "clipboard_read" });
    return originalReadText();
  };
}

const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function (
  ...args: Parameters<typeof originalToDataURL>
) {
  notifyBridge({ kind: "sensitive_api", api: "canvas_fingerprint" });
  return originalToDataURL.apply(this, args);
};

// --- Outbound field classification (type only, never the value) ----------

function classifyField(
  el: HTMLInputElement
): "credential" | "payment_card" | "government_id" | "generic_text" {
  if (el.type === "password") return "credential";
  const autocomplete = (el.autocomplete || "").toLowerCase();
  if (autocomplete.includes("cc-")) return "payment_card";
  if (/^\d{3}-?\d{2}-?\d{4}$/.test(el.value)) return "government_id";
  return "generic_text";
}
// --- Pre-emptive protection: analyze BEFORE the user types -------------

document.addEventListener(
  "focusin",
  (e) => {
    const field = e.target as HTMLInputElement;

    if (!(field instanceof HTMLInputElement)) return;

    const fieldType = classifyField(field);

    // Only trigger for fields that Vault can identify as sensitive.
    if (
      fieldType !== "credential" &&
      fieldType !== "payment_card" &&
      fieldType !== "government_id"
    ) {
      return;
    }

    // Send ONLY the field type — never the actual value.
    notifyBridge({
      kind: "field_focus",
      fieldType,
    });
  },
  true
);

document.addEventListener(
  
  "submit",
  (e) => {
    const form = e.target as HTMLFormElement;
    const sensitiveInput = form.querySelector<HTMLInputElement>(
      "input[type=password], input[autocomplete*='cc-']"
    );
    if (!sensitiveInput) return; // nothing sensitive in this form, let it through

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
        const proceed = window.confirm(`Vault: ${verdict.reason}\n\nSend anyway?`);
        if (proceed) form.submit();
      }
    });
  },
  true
);