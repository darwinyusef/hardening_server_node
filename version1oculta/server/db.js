const { Pool } = require("pg");

if (!process.env.DB_PASSWORD) {
    console.error("FATAL: DB_PASSWORD no está definido en las variables de entorno");
    process.exit(1);
}

const pool = new Pool({
    user:     process.env.DB_USER,
    host:     process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port:     parseInt(process.env.DB_PORT || "5432"),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false
});

module.exports = pool;
