import type { AnalyzeRequest, AnalyzeResponse, TabSession, BridgeMessage } from "./types";

const BACKEND_URL = "http://localhost:8010";
const USER_PRIVACY_PREFERENCE =
  "warn me before sharing anything sensitive with a site I haven't visited before";

const sessions = new Map<number, TabSession>();

function getSession(tabId: number): TabSession {
  if (!sessions.has(tabId)) {
    sessions.set(tabId, { redirectChain: [], events: [] });
  }
  return sessions.get(tabId)!;
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

async function callAnalyze(body: AnalyzeRequest): Promise<AnalyzeResponse> {
  const res = await fetch(`${BACKEND_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Messages arrive either from a content script (sender.tab is set) or from
// the side panel asking for the current session (message.kind === "get_session").
chrome.runtime.onMessage.addListener(
  (message: (BridgeMessage & Record<string, unknown>) | { kind: "get_session"; tabId: number }, sender, sendResponse) => {
    if (message.kind === "get_session") {
      sendResponse(sessions.get((message as { tabId: number }).tabId) ?? { redirectChain: [], events: [] });
      return;
    }

    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    const session = getSession(tabId);

    if (message.kind === "sensitive_api") {
      session.events.push({ type: (message as { api: string }).api, hop: session.redirectChain.length });
      chrome.runtime.sendMessage({ kind: "session_update", tabId, session }).catch(() => {});
      return;
    }

    if (message.kind === "field_submit") {
      session.events.push({ type: "field_submit", hop: session.redirectChain.length });
      callAnalyze({
        redirect_chain: session.redirectChain,
        session_events: session.events,
        outbound_data: { field_type: (message as { fieldType: any }).fieldType, action: "form_submit" },
        user_privacy_preference: USER_PRIVACY_PREFERENCE,
      }).then((verdict) => {
        sendResponse(verdict);
        chrome.runtime.sendMessage({ kind: "session_update", tabId, session, verdict }).catch(() => {});
      });
      return true; // keep the message channel open for the async sendResponse above
    }
  }
);
