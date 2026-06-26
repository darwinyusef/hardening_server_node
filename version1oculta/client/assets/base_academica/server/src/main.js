const express = require('express')
const app = express()
const cors = require('cors');
const port = 3000

app.use(cors());
app.use(express.json());

const datas = [
  { id: 1, nombre: 'Valen', edad: 25 },
  { id: 2, nombre: 'Juan', edad: 30 },
  { id: 3, nombre: 'Maria', edad: 28 }  
]

app.get('/', (req, res) => {
  res.json({ mensaje: 'CORS abierto 🚀', datas: datas });
})

app.get('/producto', (req, res) => {
  res.json({ mensaje: 'getall producto abierto 🚀' });
})


app.get('/:id', (req, res) => {
  const id = req.params.id;
  
 const dfinal = { nombre: 'Valen', edad: 25 }
  console.log(id, dfinal)
  res.json({ ms: "true", id: id, data: dfinal });
})

app.post('/', (req, res) => {
  const data = req.body;
  console.log(data)
  res.json({ mensaje: 'POST abierto 🚀' });
})

app.put('/:id', (req, res) => {
  const id = req.params.id;
  const data = req.body;
  console.log(id, data)
  if (!data) {
    return res.status(400).json({ error: 'Datos requeridos' });
  }
  res.json({ mensaje: 'Put abierto 🚀' });
})

app.patch('/:id', (req, res) => {
  const id = req.params.id;
  const data = req.body;
  console.log(data,id)

  if (!data) {
    return res.status(400).json({ error: 'Datos requeridos' });
  }
  res.json({ mensaje: 'actualizar1 abierto' });
})

app.delete('/:id', (req, res) => {
  const id = req.params.id;
  console.log(id)
  res.json({ mensaje: 'Eliminar abierto 🚀' });
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})