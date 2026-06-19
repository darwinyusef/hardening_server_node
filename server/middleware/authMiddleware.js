const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ message: "Token requerido" });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        console.error("JWT_SECRET no configurado");
        return res.status(500).json({ message: "Error de configuración del servidor" });
    }

    jwt.verify(token, secret, (err, decoded) => {
        if (err) return res.status(401).json({ message: "Token inválido o expirado" });
        req.user = decoded;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (!req.user || req.user.rol !== 'admin') {
        return res.status(403).json({ message: "Acceso denegado: Se requiere rol administrador" });
    }
    next();
};

module.exports = { verifyToken, isAdmin };
