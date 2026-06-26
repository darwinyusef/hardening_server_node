'use strict';

/**
 * Monitoring middleware for module_login.
 *
 * Tracks (matching Grafana dashboard panels):
 *   - Logins OK / FAIL          → panel "logins"
 *   - Sign-ups                  → panel "Sign ups"
 *   - Recovery requests         → panel "Support calls"
 *   - Request count per route   → panel "server requests"
 *   - Response-time percentiles → panel "client side full page load"
 *   - Process memory (RSS)      → panel "Memory"
 *
 * Integration in server/server.js:
 *   const { requestMiddleware, monitorRouter } = require('../monitorize/monitor');
 *   app.use(requestMiddleware);
 *   app.use('/monitor', monitorRouter);   // GET /monitor/stats
 *
 * Integration in controllers (authController.js, recoveryController.js):
 *   const { trackEvent } = require('../../monitorize/monitor');
 *   trackEvent('login_ok',  { ip: req.ip });
 *   trackEvent('login_fail', { ip: req.ip });
 *   trackEvent('signup',    { ip: req.ip });
 *   trackEvent('recovery',  { ip: req.ip });
 */

const fs   = require('fs');
const path = require('path');
const express = require('express');

const METRICS_FILE  = path.join(__dirname, 'metrics.jsonl');
const MAX_RT_BUFFER = 2000; // keep last N response times in memory

// ── In-memory state ───────────────────────────────────────────────────────────
const state = {
  logins_ok:   0,
  logins_fail: 0,
  signups:     0,
  recovery:    0,
  requests:    {},  // { 'POST /api/login': 42 }
  rt:          [],  // response times in ms (ring buffer)
};

// ── Persistence ───────────────────────────────────────────────────────────────
function appendMetric(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFile(METRICS_FILE, line, () => {});
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Called from controllers to record business events. */
function trackEvent(type, meta = {}) {
  switch (type) {
    case 'login_ok':   state.logins_ok++;   break;
    case 'login_fail': state.logins_fail++; break;
    case 'signup':     state.signups++;     break;
    case 'recovery':   state.recovery++;    break;
  }
  appendMetric({ type, ...meta });
}

/** Express middleware — mounts before routes. */
function requestMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const ms  = Date.now() - start;
    const key = `${req.method} ${req.path}`;

    state.requests[key] = (state.requests[key] || 0) + 1;
    state.rt.push(ms);
    if (state.rt.length > MAX_RT_BUFFER) state.rt.shift();

    appendMetric({ type: 'request', method: req.method, path: req.path, status: res.statusCode, ms });
  });

  next();
}

// ── Stats helpers ─────────────────────────────────────────────────────────────
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function buildStats() {
  const mem = process.memoryUsage();
  return {
    ts:         new Date().toISOString(),
    uptime_s:   Math.round(process.uptime()),
    memory_mb:  Math.round(mem.rss / 1024 / 1024),
    logins:     { ok: state.logins_ok, fail: state.logins_fail },
    signups:    state.signups,
    recovery:   state.recovery,
    requests:   state.requests,
    response_times_ms: {
      p25: percentile(state.rt, 25),
      p50: percentile(state.rt, 50),
      p75: percentile(state.rt, 75),
      p95: percentile(state.rt, 95),
      p99: percentile(state.rt, 99),
      samples: state.rt.length,
    },
  };
}

// ── Express router ────────────────────────────────────────────────────────────
const monitorRouter = express.Router();

// Protect with MONITOR_TOKEN env var when set
monitorRouter.use((req, res, next) => {
  const token = process.env.MONITOR_TOKEN;
  if (!token) return next();
  if (req.headers['x-monitor-token'] === token) return next();
  res.status(401).json({ message: 'Unauthorized' });
});

monitorRouter.get('/stats', (req, res) => {
  res.json(buildStats());
});

module.exports = { requestMiddleware, trackEvent, monitorRouter, buildStats };
