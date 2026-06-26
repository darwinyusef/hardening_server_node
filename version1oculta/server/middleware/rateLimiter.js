const rateLimit = require('express-rate-limit');

// 100 peticiones cada 15 min por IP (protección general)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiadas solicitudes, intenta más tarde" }
});

// 5 intentos de login cada 15 min por IP (fuerza bruta)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiados intentos de inicio de sesión. Espera 15 minutos" }
});

// 3 solicitudes de recuperación por hora por IP
const recoveryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiadas solicitudes de recuperación. Espera 1 hora" }
});

module.exports = { globalLimiter, loginLimiter, recoveryLimiter };
