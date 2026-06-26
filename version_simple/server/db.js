const bcrypt = require('bcrypt');

// ── Usuarios en memoria (se reinicia con el contenedor) ────────
// Contraseñas pre-hasheadas al arrancar para no bloquear el inicio
const SEED_USERS = [
    { id: '1', nombre: 'Admin',    email: 'admin@test.com',    password: 'Admin1234!',    rol: 'admin' },
    { id: '2', nombre: 'Vendedor', email: 'vendedor@test.com', password: 'Vendedor1234!', rol: 'vendedor' },
    { id: '3', nombre: 'Usuario',  email: 'usuario@test.com',  password: 'Usuario1234!',  rol: 'usuario' },
];

let users = [];
let products = [
    { id: '1', nombre: 'Laptop Pro',    descripcion: 'Portátil de alto rendimiento', precio: 1200, stock: 5,  categoria: 'Electrónica', activo: true },
    { id: '2', nombre: 'Mouse Inalámbrico', descripcion: 'Mouse ergonómico',         precio: 25,   stock: 50, categoria: 'Accesorios',  activo: true },
    { id: '3', nombre: 'Teclado Mecánico', descripcion: 'Teclado con switches azules', precio: 80, stock: 20, categoria: 'Accesorios',  activo: true },
    { id: '4', nombre: 'Monitor 4K',    descripcion: 'Pantalla 27" UHD',             precio: 350,  stock: 8,  categoria: 'Electrónica', activo: true },
    { id: '5', nombre: 'Webcam HD',     descripcion: 'Cámara 1080p con micrófono',   precio: 60,   stock: 15, categoria: 'Periféricos', activo: false },
];

let nextUserId    = 4;
let nextProductId = 6;

async function seed() {
    users = await Promise.all(SEED_USERS.map(async u => ({
        ...u,
        password: await bcrypt.hash(u.password, 12)
    })));
    console.log('DB en memoria lista — usuarios seed cargados');
}

module.exports = {
    getUsers:    ()  => users,
    getProducts: ()  => products,
    findUserByEmail: (email) => users.find(u => u.email === email),
    findUserById:    (id)    => users.find(u => u.id === id),
    addUser: (data) => {
        const user = { id: String(nextUserId++), ...data };
        users.push(user);
        return user;
    },
    updateUserRole: (id, rol) => {
        const u = users.find(u => u.id === id);
        if (u) u.rol = rol;
        return u;
    },
    findProductById: (id)  => products.find(p => p.id === id),
    addProduct: (data) => {
        const p = { id: String(nextProductId++), activo: true, ...data };
        products.push(p);
        return p;
    },
    updateProduct: (id, data) => {
        const idx = products.findIndex(p => p.id === id);
        if (idx === -1) return null;
        products[idx] = { ...products[idx], ...data };
        return products[idx];
    },
    seed,
};
