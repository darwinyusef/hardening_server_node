#!/bin/sh
# Collect system CPU and memory and append to metrics.jsonl.
#
# Add to crontab (every minute):
#   * * * * * /app/monitorize/collect.sh
#
# Or run manually:
#   sh monitorize/collect.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
METRICS="$DIR/metrics.jsonl"
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── CPU via /proc/stat (two samples, 1 s apart) ───────────────────────────────
cpu_sample() {
  awk '/^cpu / {print $2+$3+$4+$5+$6+$7+$8, $5}' /proc/stat
}

read TOTAL1 IDLE1 <<EOF
$(cpu_sample)
EOF
sleep 1
read TOTAL2 IDLE2 <<EOF
$(cpu_sample)
EOF

DTOTAL=$(( TOTAL2 - TOTAL1 ))
DIDLE=$(( IDLE2 - IDLE1 ))

if [ "$DTOTAL" -gt 0 ]; then
  CPU=$(( (DTOTAL - DIDLE) * 100 / DTOTAL ))
else
  CPU=0
fi

# ── Memory via /proc/meminfo ──────────────────────────────────────────────────
MEM_TOTAL=$(awk '/^MemTotal/{print int($2/1024)}' /proc/meminfo)
MEM_AVAIL=$(awk '/^MemAvailable/{print int($2/1024)}' /proc/meminfo)
MEM_USED=$(( MEM_TOTAL - MEM_AVAIL ))

# ── Append JSON line ──────────────────────────────────────────────────────────
printf '{"ts":"%s","type":"system","cpu_pct":%d,"mem_used_mb":%d,"mem_total_mb":%d}\n' \
  "$TS" "$CPU" "$MEM_USED" "$MEM_TOTAL" >> "$METRICS"
