# Vault — Real-Time AI Browsing Guardian

## Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt --break-system-packages
cp .env.example .env   # paste your Featherless API key into .env
uvicorn main:app --reload --port 8020
```

Test it:
```bash
curl -X POST http://localhost:8020/analyze \
  -H "Content-Type: application/json" \
  -d '{"redirect_chain": ["site-a.com", "ads.track.net", "fake-site.xyz"], "session_events": [{"type": "clipboard_read", "hop": 2}], "outbound_data": {"field_type": "credential", "action": "form_submit"}}'
```

## Extension

```bash
cd extension
npm install
npm run build      # or: npm run watch (rebuilds on save)
```

Then load it in Chrome:
1. `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select the `extension/` folder
4. Click the extension icon → open the side panel to see the live feed

## What's built vs. what's left

Built: redirect chain tracking, clipboard/canvas interception, password and
credit-card field classification on submit, backend `/analyze` with
Featherless + JSON cache, side panel feed, AI privacy report.

Left as an exercise / stretch goals: lookalike-domain detection, page-content
urgency-language scan, permission (geolocation/camera) interception, animated
trust score. See the conversation history for the design of each.
