const jwt = require('jsonwebtoken');
const db = require('../config/db');

if (!process.env.JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en las variables de entorno (.env)');
}

// Uso: router.get('/ruta', auth, controlador)
// Si el token es válido y la sesión sigue vigente, deja el id del usuario en req.user.id
module.exports = async function auth(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado', codigo: 'SIN_TOKEN' });
  }

  let datos;
  try {
    datos = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      // Los clientes usan este código para saber que deben llamar a /refresh
      return res.status(401).json({ error: 'Sesión expirada', codigo: 'TOKEN_EXPIRADO' });
    }
    return res.status(401).json({ error: 'Token inválido', codigo: 'TOKEN_INVALIDO' });
  }

  try {
    // "Cerrar sesión en todos los dispositivos" sube sesion_version. Un token emitido antes
    // lleva un número anterior y se rechaza al instante, sin esperar a que venza.
    const r = await db.query('SELECT sesion_version FROM usuarios WHERE id = $1', [datos.id]);
    if (r.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado', codigo: 'TOKEN_INVALIDO' });
    }
    if ((datos.sv ?? 0) !== (r.rows[0].sesion_version ?? 0)) {
      return res.status(401).json({ error: 'Sesión cerrada', codigo: 'SESION_REVOCADA' });
    }
    req.user = { id: datos.id };
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al verificar la sesión' });
  }
};
