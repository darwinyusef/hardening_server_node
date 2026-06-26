const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");
const { loginLimiter } = require("../middleware/rateLimiter");

// --- RUTAS PÚBLICAS ---
router.post("/register", authController.register);
router.get("/verify", authController.verifyEmail);
router.post("/login", loginLimiter, authController.login);

// --- RUTAS DE ADMINISTRACIÓN (RBAC) ---
router.get("/users", verifyToken, isAdmin, authController.getAllUsers);
router.put("/update-role", verifyToken, isAdmin, authController.updateRole);

module.exports = router;
