const client = require('prom-client');

const register = new client.Registry();

client.collectDefaultMetrics({ register, prefix: 'cefit_' });

const httpRequestDuration = new client.Histogram({
    name: 'cefit_http_request_duration_seconds',
    help: 'Duración de requests HTTP en segundos',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
});

const httpRequestsTotal = new client.Counter({
    name: 'cefit_http_requests_total',
    help: 'Total de requests HTTP',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
});

function metricsMiddleware(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const duration = Number(process.hrtime.bigint() - start) / 1e9;
        const route = req.route?.path ?? req.path;
        const labels = { method: req.method, route, status_code: res.statusCode };
        httpRequestDuration.observe(labels, duration);
        httpRequestsTotal.inc(labels);
    });
    next();
}

module.exports = { register, metricsMiddleware };
