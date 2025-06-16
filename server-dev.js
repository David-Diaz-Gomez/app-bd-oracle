const express = require('express');
const path = require('path');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Ruta principal con datos simulados
app.get('/', (req, res) => {
  const ubicaciones = [
    ['57', 'Colombia'],
    ['1', 'E.U'],
    ['34', 'España'],
    ['54', 'Argentina'],
    ['81', 'Antioquia']
  ];
  res.render('registro', { ubicaciones });
});

// Servidor de prueba
app.listen(3000, () => {
  console.log('Servidor de diseño corriendo en http://localhost:3000');
});
