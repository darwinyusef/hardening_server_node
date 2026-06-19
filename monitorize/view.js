#!/usr/bin/env node
'use strict';

/**
 * CLI dashboard — reads metrics.jsonl and prints a summary.
 * Usage: node monitorize/view.js [--tail N]
 *
 * Example:
 *   node monitorize/view.js            # last 20 system snapshots
 *   node monitorize/view.js --tail 50  # last 50 system snapshots
 */

const fs   = require('fs');
const path = require('path');
const rl   = require('readline');

const METRICS_FILE = path.join(__dirname, 'metrics.jsonl');
const tailArg = process.argv.indexOf('--tail');
const TAIL = tailArg !== -1 ? parseInt(process.argv[tailArg + 1], 10) || 20 : 20;

if (!fs.existsSync(METRICS_FILE)) {
  console.error('No metrics.jsonl found. Start the server or run collect.sh first.');
  process.exit(1);
}

// Aggregate counters
const agg = {
  logins_ok: 0, logins_fail: 0,
  signups: 0, recovery: 0,
  requests: {},
  rt: [],
  system: [],
};

const reader = rl.createInterface({ input: fs.createReadStream(METRICS_FILE) });

reader.on('line', (line) => {
  if (!line.trim()) return;
  let m;
  try { m = JSON.parse(line); } catch { return; }

  switch (m.type) {
    case 'login_ok':   agg.logins_ok++;   break;
    case 'login_fail': agg.logins_fail++; break;
    case 'signup':     agg.signups++;     break;
    case 'recovery':   agg.recovery++;    break;
    case 'request':
      if (m.method && m.path) {
        const key = `${m.method} ${m.path}`;
        agg.requests[key] = (agg.requests[key] || 0) + 1;
        if (m.ms != null) agg.rt.push(m.ms);
      }
      break;
    case 'system':
      agg.system.push(m);
      break;
  }
});

reader.on('close', () => {
  const bar   = (n, max, w = 20) => '█'.repeat(Math.round((n / max) * w)).padEnd(w, '░');
  const pct   = (arr, p) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
  };

  const hr = () => console.log('─'.repeat(56));

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║            MODULE LOGIN — MONITOR REPORT            ║');
  console.log(`╚${'═'.repeat(54)}╝\n`);

  // ── Logins ──────────────────────────────────────────────
  hr();
  const totalLogins = agg.logins_ok + agg.logins_fail;
  const failRate = totalLogins ? Math.round((agg.logins_fail / totalLogins) * 100) : 0;
  console.log(' LOGINS');
  console.log(`  OK    ${String(agg.logins_ok).padStart(6)}  ${bar(agg.logins_ok, totalLogins || 1)}`);
  console.log(`  FAIL  ${String(agg.logins_fail).padStart(6)}  ${bar(agg.logins_fail, totalLogins || 1)}  (${failRate}% fail rate)`);

  // ── Sign-ups & Recovery ──────────────────────────────────
  hr();
  console.log(' EVENTS');
  console.log(`  Sign-ups          ${agg.signups}`);
  console.log(`  Recovery requests ${agg.recovery}`);

  // ── Server requests ──────────────────────────────────────
  hr();
  console.log(' SERVER REQUESTS');
  const sorted = Object.entries(agg.requests).sort((a, b) => b[1] - a[1]);
  const maxReq  = sorted[0]?.[1] || 1;
  sorted.forEach(([k, v]) => {
    console.log(`  ${k.padEnd(28)} ${String(v).padStart(5)}  ${bar(v, maxReq, 12)}`);
  });
  if (!sorted.length) console.log('  (none yet)');

  // ── Response times ───────────────────────────────────────
  hr();
  console.log(' RESPONSE TIMES (ms)');
  const maxMs = pct(agg.rt, 99) || 1;
  [25, 50, 75, 95, 99].forEach(p => {
    const v = pct(agg.rt, p);
    console.log(`  p${String(p).padEnd(3)} ${String(v).padStart(6)} ms  ${bar(v, maxMs, 16)}`);
  });
  console.log(`  samples: ${agg.rt.length}`);

  // ── System snapshots (last N) ────────────────────────────
  hr();
  const recent = agg.system.slice(-TAIL);
  console.log(` SYSTEM SNAPSHOTS (last ${recent.length})`);
  if (!recent.length) {
    console.log('  (no system data — run collect.sh)');
  } else {
    recent.forEach(s => {
      const cpuBar = bar(s.cpu_pct, 100, 10);
      const memPct = s.mem_total_mb ? Math.round((s.mem_used_mb / s.mem_total_mb) * 100) : 0;
      const memBar = bar(memPct, 100, 10);
      console.log(
        `  ${s.ts}  CPU ${String(s.cpu_pct).padStart(3)}% ${cpuBar}  ` +
        `MEM ${String(s.mem_used_mb).padStart(5)}/${s.mem_total_mb} MB ${memBar}`
      );
    });
  }

  hr();
  console.log('');
});
