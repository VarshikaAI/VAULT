const feed = document.getElementById("feed")!;
const reportBtn = document.getElementById("reportBtn")!;
const reportDiv = document.getElementById("report")!;

chrome.runtime.onMessage.addListener((message) => {
  if (message.kind !== "session_update") return;
  const { session, verdict } = message;
  const row = document.createElement("div");
  row.className = "event";
  const last = session.events[session.events.length - 1];
  row.textContent = `${session.redirectChain.join(" -> ") || "direct"} | ${last?.type ?? ""} ${
    verdict ? `-> ${verdict.verdict}: ${verdict.reason}` : ""
  }`;
  feed.prepend(row);
});

reportBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const session = await chrome.runtime.sendMessage({ kind: "get_session", tabId: tab.id });

  reportDiv.textContent = "Generating...";
  const res = await fetch("http://localhost:8010/privacy-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_chain: session.redirectChain,
      session_events: session.events,
      user_privacy_preference: "warn me before sharing anything sensitive",
    }),
  });
  const data = await res.json();
  reportDiv.textContent = data.report;
});
