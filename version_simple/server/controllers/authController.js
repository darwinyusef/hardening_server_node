const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const ROLES = ['admin', 'vendedor', 'usuario'];

exports.register = async (req, res) => {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password)
        return res.status(400).json({ message: 'Campos obligatorios incompletos' });
    if (!isValidEmail(email))
        return res.status(400).json({ message: 'Formato de correo inválido' });
    if (password.length < 8)
        return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
    if (db.findUserByEmail(email))
        return res.status(409).json({ message: 'El correo ya está registrado' });

    const hashed = await bcrypt.hash(password, 12);
    const user   = db.addUser({ nombre, email, password: hashed, rol: 'usuario' });

    res.status(201).json({ message: 'Usuario registrado', id: user.id });
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ message: 'Correo y contraseña requeridos' });

    const MSG = 'Credenciales incorrectas';
    const user = db.findUserByEmail(email);

    if (!user) {
        // timing attack mitigation
        await bcrypt.compare(password, '$2b$12$invalidhashpadding000000000000000000000000000000000000');
        return res.status(401).json({ message: MSG });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: MSG });

    const token = jwt.sign(
        { id: user.id, rol: user.rol, nombre: user.nombre },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
    );

    res.cookie('token', token, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   2 * 60 * 60 * 1000
    });

    res.json({ message: 'Bienvenido', rol: user.rol, nombre: user.nombre, token });
};

exports.logout = (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Sesión cerrada' });
};

exports.me = (req, res) => {
    const user = db.findUserById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    const { password: _, ...safe } = user;
    res.json(safe);
};

exports.getAllUsers = (req, res) => {
    const users = db.getUsers().map(({ password: _, ...u }) => u);
    res.json(users);
};

exports.updateRole = (req, res) => {
    const { id, rol } = req.body;
    if (!id || !ROLES.includes(rol))
        return res.status(400).json({ message: 'ID o rol inválido' });
    const user = db.updateUserRole(id, rol);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({ message: 'Rol actualizado', user: { id: user.id, rol: user.rol } });
};
