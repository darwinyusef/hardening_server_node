const pool = require("../db");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

const RECOVERY_TOKEN_MINUTES = parseInt(process.env.RECOVERY_TOKEN_MINUTES || "60");

// PASO 1: Recibe el correo y envía el link con token de expiración
exports.enviarRecovery = async (req, res) => {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Correo inválido" });
    }

    // Respuesta genérica siempre — no revelar si el correo existe
    const MSG_GENERICO = "Si el correo existe, recibirás un enlace de recuperación";

    try {
        const resultado = await pool.query(
            "SELECT id, name FROM users WHERE email = $1 AND active = true",
            [email]
        );

        if (resultado.rows.length === 0) {
            return res.json({ message: MSG_GENERICO });
        }

        const usuario = resultado.rows[0];
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_MINUTES * 60 * 1000);

        // Limpiar tokens anteriores del usuario antes de crear uno nuevo
        await pool.query(
            "UPDATE users SET change_pass_id = NULL WHERE id = $1",
            [usuario.id]
        );

        await pool.query(
            "INSERT INTO change_pass (id, expires_at) VALUES ($1, $2)",
            [token, expiresAt]
        );

        await pool.query(
            "UPDATE users SET change_pass_id = $1 WHERE id = $2",
            [token, usuario.id]
        );

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
        const link = `${frontendUrl}/client/nueva_password.html?token=${token}`;

        await transporter.sendMail({
            from: process.env.MAIL_USER,
            to: email,
            subject: "Recupera tu contraseña",
            html: `
                <h2>Hola ${usuario.name}</h2>
                <p>Recibimos una solicitud para restablecer tu contraseña.</p>
                <p>Haz clic en el siguiente enlace para crear una nueva:</p>
                <a href="${link}">Restablecer contraseña</a>
                <p>Este enlace expira en <strong>${RECOVERY_TOKEN_MINUTES} minutos</strong>.</p>
                <p>Si no solicitaste esto, puedes ignorar este correo.</p>
            `
        });

        res.json({ message: MSG_GENERICO });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
};

// PASO 2: Recibe el token, valida expiración y guarda la nueva contraseña
exports.guardarNuevaPassword = async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ message: "Token y contraseña son requeridos" });
    }
    if (password.length < 8) {
        return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
    }

    try {
        const resultado = await pool.query(
            `SELECT u.id
             FROM users u
             JOIN change_pass cp ON cp.id = u.change_pass_id
             WHERE u.change_pass_id = $1
               AND cp.expires_at > NOW()`,
            [token]
        );

        if (resultado.rows.length === 0) {
            return res.status(400).json({ message: "El enlace no es válido o ya expiró" });
        }

        const usuario = resultado.rows[0];
        const nuevaPasswordEncriptada = await bcrypt.hash(password, 12);

        await pool.query(
            "UPDATE users SET password = $1, change_pass_id = NULL WHERE id = $2",
            [nuevaPasswordEncriptada, usuario.id]
        );

        // Eliminar el token usado para que no pueda reutilizarse
        await pool.query("DELETE FROM change_pass WHERE id = $1", [token]);

        res.json({ message: "Contraseña actualizada correctamente" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
};
