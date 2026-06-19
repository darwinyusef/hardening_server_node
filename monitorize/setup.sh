#!/bin/sh
# One-time setup: register collect.sh as a cron job (every minute).
# Run as root or the app user inside the container.
#
# Usage: sh monitorize/setup.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$DIR/collect.sh"

chmod +x "$SCRIPT"

# Install crond if missing (Alpine)
if ! command -v crontab > /dev/null 2>&1; then
  echo "[setup] Installing cronie/busybox-cron..."
  apk add --no-cache busybox-extras > /dev/null 2>&1 || \
  apt-get install -y cron > /dev/null 2>&1
fi

# Add cron entry (idempotent)
ENTRY="* * * * * $SCRIPT"
( crontab -l 2>/dev/null | grep -v "$SCRIPT"; echo "$ENTRY" ) | crontab -

echo "[monitor] Cron registered: $ENTRY"
echo "[monitor] Metrics will be appended to: $DIR/metrics.jsonl"
echo ""
echo "To view stats:"
echo "  node monitorize/view.js"
echo "  curl http://localhost:3000/monitor/stats"
