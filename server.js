// Carga las variables de entorno desde el archivo .env
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { getConnection } = require('./oracle-connection'); // Asegúrate de que este archivo esté correcto y funcione

const app = express();
const registrosPendientes = {};

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

// Configura Nodemailer para usar Resend (SMTP)
// Utiliza variables de entorno para las credenciales
const transporter = nodemailer.createTransport({
  host: "smtp.resend.com",
  port: 465, // El puerto 465 es para SSL/TLS (seguro)
  secure: true, // Si es puerto 465, secure debe ser true
  auth: {
    user: "resend", // El usuario para Resend SMTP es siempre "resend"
    pass: process.env.RESEND_API_KEY, // Tu API Key de Resend
  },
});

app.get('/', async (req, res) => {
  let conn; // Declarar conn fuera del try para asegurar que esté disponible en finally
  try {
    conn = await getConnection();
    const result = await conn.execute('SELECT codUbica, nomUbica FROM Ubicacion WHERE tipoUbica = 1');
    // Cierra la conexión después de usarla
    await conn.close();
    res.render('registro', { ubicaciones: result.rows });
  } catch (error) {
    console.error('Error al obtener ubicaciones de la base de datos:', error);
    // Asegúrate de cerrar la conexión en caso de error también
    if (conn) {
      try {
        await conn.close();
      } catch (closeError) {
        console.error('Error al cerrar la conexión en GET /:', closeError);
      }
    }
    res.status(500).send('Error interno del servidor al cargar el formulario.');
  }
});

app.post('/enviar-validacion', async (req, res) => {
  const datos = req.body;
  const token = crypto.randomBytes(20).toString('hex');
  registrosPendientes[token] = datos;

  // Asegúrate de que 'http://localhost:3000' es el host correcto para tu desarrollo.
  // En producción, esto debería ser el dominio público de tu aplicación.
  const link = `http://localhost:3000/validar/${token}`;

  const mailOptions = {
    // Usa la dirección de correo electrónico verificada en Resend
    from: process.env.FROM_EMAIL_ADDRESS,
    to: datos.email, // El correo del usuario que se registra
    subject: 'Confirma tu registro',
    html: `<p>¡Hola ${datos.nombre}!</p>
           <p>Gracias por registrarte. Por favor, haz clic en el siguiente enlace para confirmar tu correo y activar tu cuenta:</p>
           <p><a href="${link}">${link}</a></p>
           <p>Si no solicitaste este registro, puedes ignorar este correo.</p>`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.send('Correo de validación enviado. Revisa tu bandeja de entrada y la carpeta de spam.');
  } catch (error) {
    console.error('Error al enviar el correo de validación con Resend:', error);
    // Proporciona un mensaje de error más útil al usuario final
    res.status(500).send('Error al enviar el correo de validación. Por favor, verifica la dirección e inténtalo de nuevo más tarde.');
  }
});

app.get('/validar/:token', async (req, res) => {
  const token = req.params.token;
  const datos = registrosPendientes[token];

  if (!datos) {
    return res.status(400).send('Token inválido o expirado. Por favor, intenta el registro de nuevo.');
  }

  let conn; // Declarar conn fuera del try para asegurar que esté disponible en finally
  try {
    conn = await getConnection();

    // Verifica si el email ya existe antes de intentar insertar
    const check = await conn.execute(`SELECT email FROM "User" WHERE email = :email`, [datos.email]);
    if (check.rows.length > 0) {
      // Si el usuario ya está registrado, elimina el token pendiente y notifica.
      delete registrosPendientes[token];
      await conn.close();
      return res.status(409).send('El usuario con este correo electrónico ya está registrado.'); // 409 Conflict
    }

    // Insertar el nuevo usuario
    // Nota: 'user' es una palabra reservada en SQL. Se recomienda encerrarla entre comillas dobles
    // si el nombre de la columna es exactamente "user" en tu esquema de Oracle.
    // También he añadido el manejo de fecha para TO_DATE
    await conn.execute(
      `INSERT INTO "User" (consecUser, nombre, apellido, "user", fechaRegistro, email, celular, codUbica)
       VALUES (:1, :2, :3, :4, TO_DATE(:5, 'YYYY-MM-DD'), :6, :7, :8)`,
      [
        datos.consecUser,
        datos.nombre,
        datos.apellido,
        datos.user,
        datos.fechaRegistro, // Asegúrate de que este dato venga en formato 'YYYY-MM-DD' desde el formulario
        datos.email,
        datos.celular,
        datos.codUbica
      ],
      { autoCommit: true } // Confirmar la transacción automáticamente
    );

    await conn.close(); // Cierra la conexión después de la inserción exitosa
    delete registrosPendientes[token]; // Eliminar el registro pendiente

    res.send('✅ Correo validado. Usuario registrado con éxito.');
  } catch (error) {
    console.error('Error al validar token o registrar usuario:', error);
    // Asegúrate de cerrar la conexión en caso de error
    if (conn) {
      try {
        await conn.close();
      } catch (closeError) {
        console.error('Error al cerrar la conexión en GET /validar/:token:', closeError);
      }
    }
    res.status(500).send('Hubo un error interno al procesar su solicitud de validación. Por favor, inténtelo de nuevo.');
  }
});

app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});