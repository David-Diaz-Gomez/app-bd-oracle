const oracledb = require('oracledb');

async function getConnection() {
  return await oracledb.getConnection({
    user: 'TU_USUARIO',
    password: 'TU_CONTRASEÑA',
    connectString: 'localhost/XEPDB1'
  });
}

module.exports = { getConnection };
