const express = require('express');
const { register } = require('../middleware/metrics');

const router = express.Router();

router.get('/', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

module.exports = router;
