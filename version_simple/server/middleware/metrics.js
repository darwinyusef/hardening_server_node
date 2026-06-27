const client   = require('prom-client');
const register = new client.Registry();

client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
    name:       'http_request_duration_seconds',
    help:       'Duración de peticiones HTTP en segundos',
    labelNames: ['method', 'route', 'status'],
    buckets:    [0.01, 0.05, 0.1, 0.3, 0.5, 1],
    registers:  [register],
});

const httpTotal = new client.Counter({
    name:       'http_requests_total',
    help:       'Total de peticiones HTTP',
    labelNames: ['method', 'route', 'status'],
    registers:  [register],
});

function metricsMiddleware(req, res, next) {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
        const labels = { method: req.method, route: req.path, status: res.statusCode };
        end(labels);
        httpTotal.inc(labels);
    });
    next();
}

async function metricsHandler(req, res) {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
}

module.exports = { metricsMiddleware, metricsHandler };
