import type { BridgeMessage } from "./types";

// The MAIN-world script (content-main.ts) can't call chrome.* APIs, so it
// posts window messages that this isolated-world script relays to the
// background service worker, and relays verdicts back the same way.

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  if (ev.data?.source !== "vault-main") return;

  const payload = ev.data.payload as BridgeMessage;

  // Pre-emptive check + final submit check
  if (payload.kind === "field_focus" || payload.kind === "field_submit") {
    chrome.runtime.sendMessage(payload, (verdict) => {
      window.postMessage(
        {
          source: "vault-verdict",
          payload: verdict,
        },
        "*"
      );
    });
  } else {
    chrome.runtime.sendMessage(payload);
  }
});