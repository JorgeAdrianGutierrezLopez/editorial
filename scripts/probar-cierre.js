const base = 'http://localhost:3000/api/usuarios';
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
const login = async () => {
  const r = await http('/login', { metodo: 'POST', cuerpo: { email, password, dispositivo: 'movil' } });
  if (r.status !== 200) throw new Error('Login falló (' + r.status + '): ' + JSON.stringify(r.datos));
  return r.datos;
};
const ver = (texto, ok, detalle = '') =>
  console.log((ok ? 'OK    ' : 'FALLA ') + texto + (detalle ? ' (' + detalle + ')' : ''));

(async () => {
  const a = await login();   // "dispositivo A" (por ejemplo, la web)
  const b = await login();   // "dispositivo B" (por ejemplo, el iPhone)

  ver('antes del cierre, el dispositivo B puede usar la API', (await http('/yo', { token: b.access })).status === 200);

  const out = await http('/logout-all', { metodo: 'POST', token: a.access });
  ver('A pide cerrar sesión en todos -> 200', out.status === 200, 'estado ' + out.status);

  const yoB = await http('/yo', { token: b.access });
  ver('B pierde el acceso AL INSTANTE (401 SESION_REVOCADA)', yoB.status === 401 && yoB.datos.codigo === 'SESION_REVOCADA', yoB.status + ' ' + yoB.datos.codigo);

  const yoA = await http('/yo', { token: a.access });
  ver('A también pierde el acceso', yoA.status === 401, 'estado ' + yoA.status);

  const rB = await http('/refresh', { metodo: 'POST', cuerpo: { refresh: b.refresh } });
  ver('B no puede renovar su sesión (401)', rB.status === 401, 'estado ' + rB.status);

  const nuevo = await login();
  ver('un login nuevo sí funciona', (await http('/yo', { token: nuevo.access })).status === 200);
  ver('y su renovación sigue funcionando', (await http('/refresh', { metodo: 'POST', cuerpo: { refresh: nuevo.refresh } })).status === 200);
})().catch(e => console.error('ERROR:', e.message));
