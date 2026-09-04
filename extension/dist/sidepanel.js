"use strict";
(() => {
  // src/sidepanel.ts
  var feed = document.getElementById("feed");
  var reportDiv = document.getElementById("report");
  chrome.runtime.onMessage.addListener((message) => {
    if (message.kind === "privacy_report_update") {
      renderPrivacyReport(message.report);
      reportDiv.textContent = "Automatically updated";
    }
    if (message.kind === "session_update") {
      renderSessionEvent(message.session);
      reportDiv.textContent = "Generating automatic report...";
    }
    if (message.kind === "privacy_report_error") {
      reportDiv.textContent = "Report unavailable. Start the backend and try another activity.";
    }
  });
  function escapeHtml(value) {
    return value.replace(
      /[&<>'"]/g,
      (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      })[character] ?? character
    );
  }
  function renderPrivacyReport(report) {
    const el = document.getElementById("privacy-report");
    if (!el) return;
    el.className = `risk-${report.risk_level || "medium"}`;
    const findings = (report.key_findings || []).map((finding) => `<li>${escapeHtml(finding)}</li>`).join("");
    el.innerHTML = `
    <div class="report-risk-badge">${(report.risk_level || "medium").toUpperCase()} RISK</div>
    <div class="report-summary">${escapeHtml(report.summary || "")}</div>
    ${findings ? `<ul class="report-findings">${findings}</ul>` : ""}
    ${report.possible_impact ? `<div class="report-impact">\u26A0\uFE0F ${escapeHtml(report.possible_impact)}</div>` : ""}
    ${report.recommendation ? `<div class="report-recommendation">\u{1F4A1} ${escapeHtml(report.recommendation)}</div>` : ""}
  `;
  }
  function renderSessionEvent(session) {
    const feed2 = document.getElementById("session-feed");
    if (!feed2 || !session.events?.length) return;
    const last = session.events[session.events.length - 1];
    const item = document.createElement("div");
    item.className = "feed-event";
    item.innerHTML = `<span class="feed-event-type">${last.type}</span><span class="feed-event-hop">hop ${last.hop}</span>`;
    feed2.prepend(item);
  }
  async function loadCurrentSession() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const session = await chrome.runtime.sendMessage({ kind: "get_session", tabId: tab.id });
    if (session.latestReport) renderPrivacyReport(session.latestReport);
    if (session.events?.length) {
      reportDiv.textContent = "Automatically updated";
      renderSessionEvent(session);
    }
  }
  loadCurrentSession().catch(() => {
    reportDiv.textContent = "Waiting for browsing activity...";
  });
})();
