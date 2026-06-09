#!/usr/bin/env bash
set -euo pipefail

IDENTITY="$HOME/.quickdesk/identity.json"
if [[ ! -f "$IDENTITY" ]]; then
  echo "No QuickDesk identity found. Start the agent first:" >&2
  echo "  ./scripts/setup-mac.sh" >&2
  exit 1
fi

TOKEN="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.HOME+"/.quickdesk/identity.json","utf8")).localToken)')"
curl -sS -X POST "http://127.0.0.1:7420/approvals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "quickdesk",
    "title": "QuickDesk approval test",
    "summary": "Testing approval delivery to iPhone and Apple Watch.",
    "detail": "Allow or deny this request from QuickDesk.",
    "tool": "quickdesk-test",
    "cwd": "'"$(pwd)"'"
  }'
echo
