"use strict";
(() => {
  // src/background.ts
  var BACKEND_URL = "http://localhost:8010";
  var USER_PRIVACY_PREFERENCE = "warn me before sharing anything sensitive with a site I haven't visited before";
  var sessions = /* @__PURE__ */ new Map();
  function getSession(tabId) {
    if (!sessions.has(tabId)) {
      sessions.set(tabId, { redirectChain: [], events: [] });
    }
    return sessions.get(tabId);
  }
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    const session = getSession(details.tabId);
    const domain = new URL(details.url).hostname;
    if (session.redirectChain[session.redirectChain.length - 1] !== domain) {
      session.redirectChain.push(domain);
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => sessions.delete(tabId));
  async function callAnalyze(body) {
    const res = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.json();
  }
  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      if (message.kind === "get_session") {
        sendResponse(sessions.get(message.tabId) ?? { redirectChain: [], events: [] });
        return;
      }
      const tabId = sender.tab?.id;
      if (tabId === void 0) return;
      const session = getSession(tabId);
      if (message.kind === "sensitive_api") {
        session.events.push({ type: message.api, hop: session.redirectChain.length });
        chrome.runtime.sendMessage({ kind: "session_update", tabId, session }).catch(() => {
        });
        return;
      }
      if (message.kind === "field_submit") {
        session.events.push({ type: "field_submit", hop: session.redirectChain.length });
        callAnalyze({
          redirect_chain: session.redirectChain,
          session_events: session.events,
          outbound_data: { field_type: message.fieldType, action: "form_submit" },
          user_privacy_preference: USER_PRIVACY_PREFERENCE
        }).then((verdict) => {
          sendResponse(verdict);
          chrome.runtime.sendMessage({ kind: "session_update", tabId, session, verdict }).catch(() => {
          });
        });
        return true;
      }
    }
  );
})();
