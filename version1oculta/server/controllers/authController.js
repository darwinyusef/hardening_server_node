const pool = require("../db");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

// Validación básica de formato email
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// REGISTRO
exports.register = async (req, res) => {
    const {
        nombre, lastname, email, password,
        document, type_document, phone,
        address, age, departamento, ciudad,
        sexo, born
    } = req.body;

    // Validación de entradas
    if (!nombre || !lastname || !email || !password) {
        return res.status(400).json({ message: "Campos obligatorios incompletos" });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ message: "Formato de correo inválido" });
    }
    if (!password || password.length < 8) {
        return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
    }

    try {
        const userExist = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        if (userExist.rows.length > 0) {
            // Mismo mensaje para no revelar si el correo existe
            return res.json({ message: "Si el correo no está registrado, recibirás un correo de verificación" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const id = uuidv4();

        await pool.query(
            `INSERT INTO users
            (id, name, lastname, email, password, document, type_document, phone, address, age, departamento, ciudad, sexo, born, active)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
                id, nombre, lastname, email, hashedPassword,
                document, type_document, phone, address,
                age, departamento, ciudad, sexo, born, false
            ]
        );

        const verifyLink = `${process.env.APP_URL || 'https://iapixelcode.com'}/api/verify?id=${id}`;

        await transporter.sendMail({
            from: process.env.MAIL_USER,
            to: email,
            subject: "Verifica tu cuenta",
            html: `
                <h2>Hola ${nombre}</h2>
                <p>Haz click para verificar tu cuenta:</p>
                <a href="${verifyLink}">Verificar cuenta</a>
                <p>Este enlace es válido por 24 horas.</p>
            `
        });

        res.json({ message: "Si el correo no está registrado, recibirás un correo de verificación" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
};

// VERIFICAR EMAIL
exports.verifyEmail = async (req, res) => {
    const { id } = req.query;

    if (!id) return res.status(400).send("Enlace inválido");

    try {
        const result = await pool.query(
            "UPDATE users SET active = true WHERE id = $1 AND active = false RETURNING id",
            [id]
        );

        if (result.rowCount === 0) {
            return res.send("El enlace no es válido o la cuenta ya fue verificada");
        }

        res.send("Cuenta verificada correctamente");

    } catch (error) {
        console.error(error);
        res.status(500).send("Error al verificar");
    }
};

// LOGIN
exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Correo y contraseña son requeridos" });
    }

    // Mensaje genérico para no revelar si el usuario existe (anti-enumeración)
    const MSG_INVALIDO = "Credenciales incorrectas";

    try {
        const userRes = await pool.query(
            "SELECT id, name, rol, password, active FROM users WHERE email = $1",
            [email]
        );

        if (userRes.rows.length === 0) {
            // Ejecutar bcrypt de todas formas para evitar timing attacks
            await bcrypt.compare(password, "$2b$12$invalidhashpadding000000000000000000000000000000000000");
            return res.status(401).json({ message: MSG_INVALIDO });
        }

        const user = userRes.rows[0];

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: MSG_INVALIDO });
        }

        if (!user.active) {
            return res.status(403).json({ message: "Debes verificar tu cuenta primero" });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error("JWT_SECRET no configurado");

        const token = jwt.sign(
            { id: user.id, rol: user.rol },
            secret,
            { expiresIn: process.env.JWT_EXPIRES_IN || "2h" }
        );

        res.json({
            message: "Bienvenido",
            token,
            rol: user.rol,
            nombre: user.name
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al entrar" });
    }
};

// OBTENER TODOS LOS USUARIOS (solo admin, protegido en routes)
exports.getAllUsers = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, name, lastname, email, rol, active, created_at FROM users"
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al cargar usuarios" });
    }
};

// CAMBIAR ROL (solo admin, protegido en routes)
exports.updateRole = async (req, res) => {
    const { id, nuevoRol } = req.body;

    const rolesPermitidos = ['admin', 'vendedor', 'usuario'];
    if (!id || !nuevoRol || !rolesPermitidos.includes(nuevoRol)) {
        return res.status(400).json({ message: "Rol inválido o ID faltante" });
    }

    try {
        const result = await pool.query(
            "UPDATE users SET rol = $1 WHERE id = $2 RETURNING id",
            [nuevoRol, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        res.json({ message: "Rol actualizado con éxito" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al actualizar rol" });
    }
};
