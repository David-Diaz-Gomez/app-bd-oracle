require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { getConnection } = require('./oracle-connection');

const app = express();
const registrosPendientes = {};

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware para log de rutas
app.use((req, res, next) => {
  console.log(`🛎️ [${req.method}] ${req.url}`);
  next();
});

// Configuración de Nodemailer con Resend
const transporter = nodemailer.createTransport({
  host: "smtp.resend.com",
  port: 465,
  secure: true,
  auth: {
    user: "resend",
    pass: process.env.RESEND_API_KEY,
  },
});

// GET: formulario de registro con lista de países
app.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT CODUBICA, NOMUBICA FROM UBICACION WHERE CODTIPOUBICA = '1'`
    );
    await conn.close();
    res.render('registro', { ubicaciones: result.rows });
  } catch (error) {
    console.error('Error al obtener ubicaciones:', error);
    if (conn) await conn.close().catch(e => console.error('Error al cerrar conexión:', e));
    res.status(500).send('Error interno al cargar el formulario.');
  }
});

// POST: enviar validación por correo
app.post('/enviar-validacion', async (req, res) => {
  const datos = req.body;
  const token = crypto.randomBytes(20).toString('hex');
  registrosPendientes[token] = datos;

  const link = `http://localhost:3000/validar/${token}`;

  const mailOptions = {
    from: process.env.FROM_EMAIL_ADDRESS,
    to: datos.email,
    subject: 'Confirma tu registro',
    html: `
      <p>¡Hola ${datos.nombre}!</p>
      <p>Gracias por registrarte. Haz clic en el siguiente enlace para confirmar tu correo:</p>
      <p><a href="${link}">${link}</a></p>
      <p>Si no fuiste tú, puedes ignorar este correo.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.send('📧 Correo de validación enviado. Revisa tu bandeja de entrada o spam.');
  } catch (error) {
    console.error('Error al enviar correo:', error);
    res.status(500).send('Error al enviar el correo de validación.');
  }
});

// GET: validar token y registrar usuario
app.get('/validar/:token', async (req, res) => {
  const token = req.params.token;
  const datos = registrosPendientes[token];

  if (!datos) {
    return res.status(400).send('Token inválido o expirado.');
  }

  let conn;
  try {
    conn = await getConnection();

    const check = await conn.execute(
      `SELECT EMAIL FROM "USER" WHERE EMAIL = :email`,
      [datos.email]
    );

    if (check.rows.length > 0) {
      delete registrosPendientes[token];
      await conn.close();
      return res.status(409).send('El correo ya está registrado.');
    }

    await conn.execute(
      `INSERT INTO "USER" (CONSECUSER, NOMBRE, APELLIDO, "USER", FECHAREGISTRO, EMAIL, CELULAR, CODUBICA)
       VALUES (:1, :2, :3, :4, TO_DATE(:5, 'YYYY-MM-DD'), :6, :7, :8)`,
      [
        datos.consecUser,
        datos.nombre,
        datos.apellido,
        datos.user,
        datos.fechaRegistro,
        datos.email,
        datos.celular,
        datos.codUbica
      ],
      { autoCommit: true }
    );

    await conn.close();
    delete registrosPendientes[token];

    res.send('✅ Correo validado. Usuario registrado con éxito.');
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    if (conn) await conn.close().catch(e => console.error('Error al cerrar conexión:', e));
    res.status(500).send('Error interno al registrar el usuario.');
  }
});

app.listen(3000, () => {
  console.log('🚀 Servidor corriendo en http://localhost:3000');
});
