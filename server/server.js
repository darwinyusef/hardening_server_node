// Carga .env en desarrollo local; en Docker las vars vienen de docker-compose
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const { globalLimiter } = require('./middleware/rateLimiter');

// ── Validación temprana de variables obligatorias ─────────────
// Falla ANTES de arrancar, no después (evita servidor sin secretos)
if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET no está definido. Configura el archivo .env');
    process.exit(1);
}
if (!process.env.DB_PASSWORD) {
    console.error('FATAL: DB_PASSWORD no está definido. Configura el archivo .env');
    process.exit(1);
}

const app = express();

// ── Cabeceras de seguridad HTTP ────────────────────────────────
app.use(helmet());

// ── CORS restringido a orígenes autorizados ───────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5500').split(',');
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Origen no permitido por CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Límite de tamaño de payload ───────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ── Rate limit global ─────────────────────────────────────────
app.use(globalLimiter);

// ── Archivo de política de seguridad (RFC 9116) ───────────────
app.use('/.well-known', express.static(path.join(__dirname, '../.well-known'), {
    setHeaders: (res) => res.setHeader('Content-Type', 'text/plain; charset=utf-8')
}));

// ── Rutas API ─────────────────────────────────────────────────
app.use('/api',          require('./routes/authRoutes'));
app.use('/api',          require('./routes/recoveryRoutes'));
app.use('/api/productos', require('./routes/productRoutes'));

// ── Health check (usado por Docker y load balancers) ──────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
});

// ── Arranque ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
