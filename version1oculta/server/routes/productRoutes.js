const express = require('express');
const router  = express.Router();

const ctrl = require('../controllers/productController');
const { verifyToken, isAdmin, isAdminOrVendedor } = require('../middleware/authMiddleware');

// Lectura — todos los roles autenticados
router.get('/',           verifyToken, ctrl.getAll);
router.get('/categorias', verifyToken, ctrl.getCategorias);
router.get('/:id',        verifyToken, ctrl.getById);

// Escritura — admin o vendedor
router.post('/',          verifyToken, isAdminOrVendedor, ctrl.create);

// Solo admin
router.put('/:id',        verifyToken, isAdmin, ctrl.update);
router.delete('/:id',     verifyToken, isAdmin, ctrl.remove);

module.exports = router;
