const express = require("express");
const router = express.Router();

const recoveryController = require("../controllers/recoveryController");
const { recoveryLimiter } = require("../middleware/rateLimiter");

router.post("/recovery", recoveryLimiter, recoveryController.enviarRecovery);
router.post("/nueva-password", recoveryController.guardarNuevaPassword);

module.exports = router;
