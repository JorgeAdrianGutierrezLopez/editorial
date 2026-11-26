require('dotenv').config();
const pool = require('../src/config/db');
const base = 'http://localhost:3000/api/usuarios';

async function post(ruta, cuerpo, token) {
  const r = await fetch(base + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(cuerpo ?? {})
  });
  return { status: r.status, datos: await r.json().catch(() => ({})) };
}
const ver = (texto, ok, detalle = '') =>
  console.log((ok ? 'OK    ' : 'FALLA ') + texto + (detalle ? ' (' + detalle + ')' : ''));

(async () => {
  const email = `prueba.${Date.now()}@ejemplo.com`;
  const bueno = { nombre: 'Prueba Sesion', email, password: 'ClaveSegura123' };

  let r = await post('/register', { ...bueno, password: '123' });
  ver('registro con contraseña corta -> 400', r.status === 400, r.status + ' ' + r.datos.error);

  r = await post('/register', { ...bueno, email: 'no-es-un-correo' });
  ver('registro con correo inválido -> 400', r.status === 400, r.status + ' ' + r.datos.error);

  r = await post('/register', { ...bueno, password: 'a'.repeat(80) });
  ver('registro con contraseña de 80 caracteres -> 400', r.status === 400, r.status + ' ' + r.datos.error);

  r = await post('/register', bueno);
  ver('registro válido -> 201', r.status === 201, 'estado ' + r.status);

  r = await post('/register', bueno);
  ver('registro con el mismo correo -> 409', r.status === 409, 'estado ' + r.status);

  const l = await post('/login', { email: email.toUpperCase(), password: bueno.password, dispositivo: 'movil' });
  ver('login con el correo en MAYÚSCULAS -> 200', l.status === 200, 'estado ' + l.status);
  if (l.status !== 200) throw new Error('No pude iniciar sesión: ' + JSON.stringify(l.datos));

  const yo = await fetch(base + '/yo', { headers: { Authorization: 'Bearer ' + l.datos.access } });
  ver('GET /yo con el token -> 200', yo.status === 200, 'estado ' + yo.status);

  const out = await post('/logout-all', {}, l.datos.access);
  ver('logout-all -> 200', out.status === 200, 'estado ' + out.status);

  const ref = await post('/refresh', { refresh: l.datos.refresh });
  ver('refresh después de logout-all -> 401', ref.status === 401, 'estado ' + ref.status);

  // Limpieza: borra el usuario de prueba (sus sesiones se borran solas)
  await pool.query('DELETE FROM usuarios WHERE lower(email) = $1', [email]);
  console.log('Usuario de prueba eliminado.');
})()
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => pool.end());
