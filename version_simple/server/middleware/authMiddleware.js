const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
    const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];
    if (!token) {
        if (req.accepts('html')) return res.redirect('/login');
        return res.status(403).json({ message: 'Token requerido' });
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            if (req.accepts('html')) return res.redirect('/login');
            return res.status(401).json({ message: 'Token inválido o expirado' });
        }
        req.user = decoded;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.user?.rol !== 'admin')
        return res.status(403).json({ message: 'Se requiere rol administrador' });
    next();
}

function isAdminOrVendedor(req, res, next) {
    if (!['admin', 'vendedor'].includes(req.user?.rol))
        return res.status(403).json({ message: 'Se requiere rol administrador o vendedor' });
    next();
}

module.exports = { verifyToken, isAdmin, isAdminOrVendedor };
