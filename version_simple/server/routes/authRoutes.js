const router = require('express').Router();
const auth   = require('../controllers/authController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const { loginLimiter }         = require('../middleware/rateLimiter');

router.post('/registro', auth.register);
router.post('/login',    loginLimiter, auth.login);
router.post('/logout',   auth.logout);
router.get('/me',        verifyToken, auth.me);

// Admin only
router.get('/usuarios',      verifyToken, isAdmin, auth.getAllUsers);
router.put('/usuarios/rol',  verifyToken, isAdmin, auth.updateRole);

module.exports = router;
