const db = require('../db');

exports.getAll = (req, res) => {
    let lista = db.getProducts();
    if (req.user?.rol !== 'admin') lista = lista.filter(p => p.activo);

    const { categoria, busqueda } = req.query;
    if (categoria) lista = lista.filter(p => p.categoria === categoria);
    if (busqueda)  lista = lista.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.descripcion?.toLowerCase().includes(busqueda.toLowerCase())
    );

    res.json({ productos: lista, total: lista.length });
};

exports.getById = (req, res) => {
    const p = db.findProductById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json(p);
};

exports.create = (req, res) => {
    const { nombre, descripcion, precio, stock, categoria } = req.body;

    if (!nombre?.trim())
        return res.status(400).json({ message: 'El nombre es obligatorio' });
    if (precio === undefined || isNaN(parseFloat(precio)) || parseFloat(precio) < 0)
        return res.status(400).json({ message: 'Precio inválido' });

    const p = db.addProduct({
        nombre:      nombre.trim(),
        descripcion: descripcion?.trim() || '',
        precio:      parseFloat(precio),
        stock:       parseInt(stock) || 0,
        categoria:   categoria?.trim() || 'Sin categoría',
        creadoPor:   req.user.id,
    });

    res.status(201).json({ message: 'Producto creado', producto: p });
};

exports.update = (req, res) => {
    const { nombre, descripcion, precio, stock, categoria, activo } = req.body;

    if (!nombre?.trim())
        return res.status(400).json({ message: 'El nombre es obligatorio' });
    if (precio === undefined || isNaN(parseFloat(precio)) || parseFloat(precio) < 0)
        return res.status(400).json({ message: 'Precio inválido' });

    const p = db.updateProduct(req.params.id, {
        nombre:      nombre.trim(),
        descripcion: descripcion?.trim() || '',
        precio:      parseFloat(precio),
        stock:       parseInt(stock) || 0,
        categoria:   categoria?.trim() || 'Sin categoría',
        activo:      activo !== false && activo !== 'false',
    });

    if (!p) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json({ message: 'Producto actualizado', producto: p });
};

exports.remove = (req, res) => {
    const p = db.updateProduct(req.params.id, { activo: false });
    if (!p) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json({ message: `Producto "${p.nombre}" desactivado` });
};
