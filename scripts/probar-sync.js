require('dotenv').config();
const pool = require('../src/config/db');
const base = 'http://localhost:3000/api';
const [email, password] = process.argv.slice(2);

async function http(ruta, { metodo = 'GET', token, cuerpo } = {}) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: {
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { status: r.status, datos: await r.json().catch(() => ({})) };
}

const ver = (texto, ok, detalle = '') =>
  console.log((ok ? 'OK    ' : 'FALLA ') + texto + (detalle ? ' (' + detalle + ')' : ''));

(async () => {
  const l = await http('/usuarios/login', { metodo: 'POST', cuerpo: { email, password, dispositivo: 'movil' } });
  if (l.status !== 200) throw new Error('Login falló: ' + JSON.stringify(l.datos));
  const token = l.datos.access;
  const huella = async () => (await http('/registros/version', { token })).datos.version;

  const v0 = await huella();
  ver('GET /version responde una huella', !!v0, v0);

  const nuevo = await http('/registros', { metodo: 'POST', token,
    cuerpo: { titulo: 'PRUEBA-sync', descripcion: 'texto', categoria: 'Tecnología', estado: 'Borrador' } });
  const id = nuevo.datos.id;
  const v1 = await huella();
  ver('la huella cambia al CREAR', v1 !== v0);

  const edit = { titulo: 'PRUEBA-sync-2', descripcion: 'texto 2', categoria: 'Tecnología', estado: 'Borrador' };
  const p1 = await http('/registros/' + id, { metodo: 'PUT', token, cuerpo: { ...edit, version: nuevo.datos.version } });
  ver('PUT con la versión vigente da 200', p1.status === 200, 'estado ' + p1.status);
  const v2 = await huella();
  ver('la huella cambia al EDITAR', v2 !== v1);

  const p2 = await http('/registros/' + id, { metodo: 'PUT', token, cuerpo: { ...edit, version: nuevo.datos.version } });
  ver('PUT con versión VIEJA da 409 (choque detectado)', p2.status === 409, 'estado ' + p2.status);

  await pool.query('UPDATE registros SET descripcion = descripcion WHERE id = $1', [id]);
  const v3 = await huella();
  ver('la huella cambia con una edición directa en la BD (trigger)', v3 !== v2);

  const d = await http('/registros/' + id, { metodo: 'DELETE', token });
  ver('DELETE propio da 200', d.status === 200);
  const v4 = await huella();
  ver('la huella cambia al BORRAR', v4 !== v3);
})()
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => pool.end());