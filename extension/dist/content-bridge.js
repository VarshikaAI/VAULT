"use strict";
(() => {
  // src/content-bridge.ts
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    if (ev.data?.source !== "vault-main") return;
    const payload = ev.data.payload;
    if (payload.kind === "field_submit") {
      chrome.runtime.sendMessage(payload, (verdict) => {
        window.postMessage({ source: "vault-verdict", payload: verdict }, "*");
      });
    } else {
      chrome.runtime.sendMessage(payload);
    }
  });
})();
