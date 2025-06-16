require('dotenv').config(); // Asegúrate de que esta línea esté al inicio para cargar las variables de entorno

const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
// Asegúrate de que oracle-connection.js esté correctamente configurado para Oracle 11g XE (Thick Mode)
// y que hayas instalado el Instant Client y configurado PATH y TNS_ADMIN.
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

// =========================================================================
// CAMBIO CLAVE AQUÍ: Configuración de Nodemailer para Gmail con App Password
// =========================================================================
const transporter = nodemailer.createTransport({
  service: 'gmail', // Especifica el servicio Gmail
  auth: {
    user: process.env.EMAIL_USER, // Tu correo de Gmail desde .env
    pass: process.env.EMAIL_PASS   // Tu App Password desde .env
  }
});
// =========================================================================


// GET: formulario de registro con lista de ubicaciones (asumo que CODUBICA es el ID)
app.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    // La consulta original usaba CODTIPOUBICA = '1'. Si es un número, quita las comillas.
    // Asumo que CODUBICA y NOMUBICA son las columnas correctas para el EJS.
    const result = await conn.execute(
      `SELECT CODUBICA, NOMUBICA FROM UBICACION WHERE CODTIPOUBICA = '1'`
    );
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

// POST: enviar validación por correo
app.post('/enviar-validacion', async (req, res) => {
  const datos = req.body;
  const token = crypto.randomBytes(20).toString('hex');
  registrosPendientes[token] = datos;

  // Asegúrate de que 'http://localhost:3000' es el host correcto para tu desarrollo.
  // En producción, esto debería ser el dominio público de tu aplicación.
  const link = `http://localhost:3000/validar/${token}`;

  const mailOptions = {
    // Usar la misma dirección de correo de Gmail para el remitente
    from: process.env.EMAIL_USER,
    to: datos.email, // El correo del usuario que se registra
    subject: 'Confirma tu registro',
    html: `
      <p>¡Hola ${datos.nombre}!</p>
      <p>Gracias por registrarte. Por favor, haz clic en el siguiente enlace para confirmar tu correo y activar tu cuenta:</p>
      <p><a href="${link}">${link}</a></p>
      <p>Si no solicitaste este registro, puedes ignorar este correo.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.send('📧 Correo de validación enviado. Revisa tu bandeja de entrada o spam.');
  } catch (error) {
    console.error('Error al enviar correo de validación con Gmail:', error);
    // Proporciona un mensaje de error más útil al usuario final
    res.status(500).send('Error al enviar el correo de validación. Por favor, verifica la dirección e inténtalo de nuevo más tarde.');
  }
});

// GET: validar token y registrar usuario
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
    // Nota: "USER" es una palabra reservada en SQL, se recomienda usar comillas dobles.
    const check = await conn.execute(
      `SELECT EMAIL FROM "USER" WHERE EMAIL = :email`,
      [datos.email]
    );

    if (check.rows.length > 0) {
      // Si el usuario ya está registrado, elimina el token pendiente y notifica.
      delete registrosPendientes[token];
      await conn.close();
      return res.status(409).send('El correo ya está registrado.'); // 409 Conflict
    }

    // Insertar el nuevo usuario
    // Nota: 'USER' es una palabra reservada en SQL. Se recomienda encerrarla entre comillas dobles
    // si el nombre de la columna es exactamente "USER" en tu esquema de Oracle.
    // También he añadido el manejo de fecha para TO_DATE
    await conn.execute(
      `INSERT INTO "USER" (CONSECUSER, NOMBRE, APELLIDO, "USER", FECHAREGISTRO, EMAIL, CELULAR, CODUBICA)
       VALUES (:1, :2, :3, :4, TO_DATE(:5, 'YYYY-MM-DD'), :6, :7, :8)`,
      [
        datos.consecUser,
        datos.nombre,
        datos.apellido,
        datos.user, // Asegúrate de que 'datos.user' exista y sea el valor correcto
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
    console.error('Error al registrar usuario:', error);
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
  console.log('🚀 Servidor corriendo en http://localhost:3000');
});