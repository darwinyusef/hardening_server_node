require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const crypto       = require('crypto');
const path         = require('path');
const db           = require('./db');
const { globalLimiter } = require('./middleware/rateLimiter');

if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET no está definido');
    process.exit(1);
}

const app = express();

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Nonce por petición para CSP
app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
});

app.use((req, res, next) => {
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc:  ["'self'", `'nonce-${res.locals.nonce}'`],
                styleSrc:   ["'self'", "'unsafe-inline'"],
                imgSrc:     ["'self'", 'data:'],
            }
        }
    })(req, res, next);
});

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(globalLimiter);

// ── Vistas EJS ────────────────────────────────────────────────
app.get('/',          (req, res) => res.redirect('/login'));
app.get('/login',     (req, res) => res.render('login',     { error: null, nonce: res.locals.nonce }));
app.get('/registro',  (req, res) => res.render('registro',  { error: null, nonce: res.locals.nonce }));

const { verifyToken } = require('./middleware/authMiddleware');
app.get('/dashboard', verifyToken, (req, res) => res.render('dashboard', { user: req.user, nonce: res.locals.nonce }));
app.get('/productos', verifyToken, (req, res) => res.render('productos', { user: req.user, nonce: res.locals.nonce }));

// ── API JSON ──────────────────────────────────────────────────
app.use('/api',            require('./routes/authRoutes'));
app.use('/api/productos',  require('./routes/productRoutes'));

app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.use((req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));

// ── Arranque ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

db.seed().then(() => {
    app.listen(PORT, () =>
        console.log(`Servidor en http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`)
    );
});
