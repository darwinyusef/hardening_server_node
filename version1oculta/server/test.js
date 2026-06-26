const pool = require("./db");

pool.query("SELECT NOW()", (err, res) => {
    if (err) {
        console.error("Error:", err);
    } else {
        console.log("Conectado:", res.rows);
    }
    pool.end();
});