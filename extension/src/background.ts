 // src/background.ts
const BACKEND_URL = "http://localhost:8020";
const USER_PRIVACY_PREFERENCE =
  "warn me before sharing anything sensitive with a site I haven't visited before";

interface SessionEvent {
  type: string;
  hop: number;
}

interface Session {
  redirectChain: string[];
  events: SessionEvent[];
  latestReport?: Record<string, unknown>;
}

const sessions = new Map<number, Session>();

function getSession(tabId: number): Session {
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
    generatePrivacyReport(details.tabId, session);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => sessions.delete(tabId));

async function callAnalyze(body: Record<string, unknown>) {
  const res = await fetch(`${BACKEND_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function generatePrivacyReport(tabId: number, session: Session) {
  try {
    const snapshot = {
      redirect_chain: [...session.redirectChain],
      session_events: session.events.map((event) => ({ ...event })),
    };
    const res = await fetch(`${BACKEND_URL}/privacy-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) throw new Error(`Privacy report request failed: ${res.status}`);
    const report = await res.json();
    session.latestReport = report;
    chrome.runtime.sendMessage({ kind: "privacy_report_update", tabId, report }).catch(() => {});
  } catch {
    chrome.runtime.sendMessage({ kind: "privacy_report_error", tabId }).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.kind === "get_session") {
    sendResponse(sessions.get(message.tabId) ?? { redirectChain: [], events: [] });
    return;
  }

  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  const session = getSession(tabId);

  if (message.kind === "sensitive_api") {
    session.events.push({ type: message.api, hop: session.redirectChain.length });
    chrome.runtime.sendMessage({ kind: "session_update", tabId, session }).catch(() => {});
    generatePrivacyReport(tabId, session);
    return;
  }

  if (message.kind === "field_focus" || message.kind === "field_submit") {
    const fieldType = message.fieldType;
    session.events.push({ type: message.kind, hop: session.redirectChain.length });
    callAnalyze({
      redirect_chain: session.redirectChain,
      session_events: session.events,
      outbound_data: {
        field_type: fieldType,
        action: message.kind === "field_focus" ? "field_focus" : "form_submit",
      },
      user_privacy_preference: USER_PRIVACY_PREFERENCE,
    }).then((verdict) => {
      sendResponse(verdict);
      chrome.runtime.sendMessage({ kind: "session_update", tabId, session, verdict }).catch(() => {});
    });
    generatePrivacyReport(tabId, session);
    return true;
  }

  if (message.kind === "consent_click") {
    const scope = message.scope;
    session.events.push({ type: message.kind, hop: session.redirectChain.length });
    callAnalyze({
      redirect_chain: session.redirectChain,
      session_events: session.events,
      outbound_data: { field_type: "consent", action: "cookie_consent", scope },
      user_privacy_preference: USER_PRIVACY_PREFERENCE,
    }).then((verdict) => {
      sendResponse(verdict);
      chrome.runtime.sendMessage({ kind: "session_update", tabId, session, verdict }).catch(() => {});
    });
    generatePrivacyReport(tabId, session);
    return true;
  }
});