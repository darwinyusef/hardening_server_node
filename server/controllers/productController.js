const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

// Construye la cláusula WHERE y los parámetros a partir de los filtros recibidos.
// Devuelve también la query legible para el panel educativo del simulador.
function buildSelectQuery(filters, rol) {
    const { categoria, busqueda, precioMin, precioMax, incluirInactivos } = filters;
    const params = [];
    const conditions = [];
    let idx = 1;

    // Solo admin puede ver inactivos
    if (!(incluirInactivos === 'true' && rol === 'admin')) {
        conditions.push('activo = true');
    }
    if (categoria) {
        conditions.push(`categoria = $${idx++}`);
        params.push(categoria);
    }
    if (busqueda) {
        conditions.push(`(nombre ILIKE $${idx} OR descripcion ILIKE $${idx})`);
        params.push(`%${busqueda}%`);
        idx++;
    }
    if (precioMin && !isNaN(precioMin)) {
        conditions.push(`precio >= $${idx++}`);
        params.push(parseFloat(precioMin));
    }
    if (precioMax && !isNaN(precioMax)) {
        conditions.push(`precio <= $${idx++}`);
        params.push(parseFloat(precioMax));
    }

    const where = conditions.length
        ? `WHERE ${conditions.join('\n  AND ')}`
        : '';

    const sql = [
        'SELECT id, nombre, descripcion, precio, stock, categoria, activo, created_at',
        'FROM products',
        where,
        'ORDER BY created_at DESC'
    ].filter(Boolean).join('\n');

    return { sql, params };
}

// GET /api/productos — lista con filtros opcionales
exports.getAll = async (req, res) => {
    try {
        const { sql, params } = buildSelectQuery(req.query, req.user?.rol);
        const result = await pool.query(sql, params);

        // queryGenerada se retorna para el panel educativo del simulador
        res.json({
            productos:     result.rows,
            total:         result.rowCount,
            queryGenerada: sql
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al consultar productos' });
    }
};

// GET /api/productos/categorias — lista de categorías únicas
exports.getCategorias = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT DISTINCT categoria
             FROM products
             WHERE categoria IS NOT NULL AND activo = true
             ORDER BY categoria`
        );
        res.json(result.rows.map(r => r.categoria));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener categorías' });
    }
};

// GET /api/productos/:id
exports.getById = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM products WHERE id = $1',
            [req.params.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener producto' });
    }
};

// POST /api/productos — crear (admin o vendedor)
exports.create = async (req, res) => {
    const { nombre, descripcion, precio, stock, categoria } = req.body;

    if (!nombre?.trim()) {
        return res.status(400).json({ message: 'El nombre es obligatorio' });
    }
    if (precio === undefined || precio === null || isNaN(parseFloat(precio))) {
        return res.status(400).json({ message: 'El precio es obligatorio y debe ser un número' });
    }
    if (parseFloat(precio) < 0) {
        return res.status(400).json({ message: 'El precio no puede ser negativo' });
    }

    const id = uuidv4();
    try {
        const result = await pool.query(
            `INSERT INTO products (id, nombre, descripcion, precio, stock, categoria, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                id,
                nombre.trim(),
                descripcion?.trim() || null,
                parseFloat(precio),
                parseInt(stock) || 0,
                categoria?.trim() || null,
                req.user.id
            ]
        );
        res.status(201).json({ message: 'Producto creado correctamente', producto: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear producto' });
    }
};

// PUT /api/productos/:id — actualizar (solo admin)
exports.update = async (req, res) => {
    const { nombre, descripcion, precio, stock, categoria, activo } = req.body;

    if (!nombre?.trim()) {
        return res.status(400).json({ message: 'El nombre es obligatorio' });
    }
    if (precio === undefined || isNaN(parseFloat(precio)) || parseFloat(precio) < 0) {
        return res.status(400).json({ message: 'Precio inválido' });
    }

    try {
        const result = await pool.query(
            `UPDATE products
             SET nombre      = $1,
                 descripcion = $2,
                 precio      = $3,
                 stock       = $4,
                 categoria   = $5,
                 activo      = $6,
                 updated_at  = NOW()
             WHERE id = $7
             RETURNING *`,
            [
                nombre.trim(),
                descripcion?.trim() || null,
                parseFloat(precio),
                parseInt(stock) || 0,
                categoria?.trim() || null,
                activo !== false,
                req.params.id
            ]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.json({ message: 'Producto actualizado', producto: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar producto' });
    }
};

// DELETE /api/productos/:id — soft delete (solo admin)
exports.remove = async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE products
             SET activo = false, updated_at = NOW()
             WHERE id = $1
             RETURNING id, nombre`,
            [req.params.id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.json({ message: `Producto "${result.rows[0].nombre}" desactivado` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al desactivar producto' });
    }
};
