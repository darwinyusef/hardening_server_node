const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { globalLimiter } = require('./middleware/rateLimiter');

const app = express();

// Cabeceras de seguridad HTTP (XSS, clickjacking, MIME sniffing, etc.)
app.use(helmet());

// CORS restringido a orígenes autorizados
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5500').split(',');
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Origen no permitido por CORS'));
    },
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Limitar tamaño del cuerpo para evitar ataques de payload grande
app.use(express.json({ limit: '10kb' }));

// Rate limit global: 100 peticiones por 15 min por IP
app.use(globalLimiter);

app.use("/api", require("./routes/authRoutes"));
app.use("/api", require("./routes/recoveryRoutes"));

// Health check para Docker y load balancers
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Rutas no encontradas
app.use((req, res) => {
    res.status(404).json({ message: "Ruta no encontrada" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    if (!process.env.JWT_SECRET) {
        console.error("FATAL: JWT_SECRET no está definido en las variables de entorno");
        process.exit(1);
    }
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
