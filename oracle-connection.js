const oracledb = require('oracledb');

// ================================================================
// AÑADE ESTE BLOQUE DE CÓDIGO AQUÍ para inicializar el Thick Mode
// ================================================================

try {
  // *** MUY IMPORTANTE: Reemplaza 'C:\\oracle\\instantclient_12_1' con la ruta ABSOLUTA
  //                     donde descomprimiste el Oracle Instant Client. ***
  //                     Esta carpeta DEBE contener archivos como oci.dll, ociw32.dll, etc.
  oracledb.initOracleClient({ libDir: 'C:\\oracle\\instantclient_12_1\\instantclient-basic-windows.x64-12.1.0.2.0\\instantclient_12_1' });
  console.log('Oracle Instant Client inicializado correctamente en Thick Mode.c');
} catch (err) {
  console.error('Error al inicializar el cliente Oracle (Thick mode). Asegúrate de que la ruta sea correcta y el Instant Client esté instalado:', err);
  // Es crucial que la aplicación no continúe si no puede conectar con la DB
  // por lo que se recomienda salir si la inicialización falla.
  process.exit(1);
}

// ================================================================
// FIN DEL BLOQUE A AÑADIR
// ================================================================


async function getConnection() {
  return await oracledb.getConnection({
    user: 'USUARIO', // Asegúrate de que este sea el usuario correcto para tu aplicación
    password: 'usuario', // Asegúrate de que esta sea la contraseña correcta para tu usuario
    connectString: 'localhost/XE' // Esto está bien para Oracle 11g XE
  });
}

module.exports = { getConnection };