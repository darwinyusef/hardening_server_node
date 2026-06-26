const router = require('express').Router();
const pc     = require('../controllers/productController');
const { verifyToken, isAdmin, isAdminOrVendedor } = require('../middleware/authMiddleware');

router.get('/',      verifyToken, pc.getAll);
router.get('/:id',   verifyToken, pc.getById);
router.post('/',     verifyToken, isAdminOrVendedor, pc.create);
router.put('/:id',   verifyToken, isAdmin, pc.update);
router.delete('/:id', verifyToken, isAdmin, pc.remove);

module.exports = router;
