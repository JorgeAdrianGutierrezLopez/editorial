const base = 'http://localhost:3000/api';
const [email, password, email2, password2] = process.argv.slice(2);

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

async function login(e, p) {
  const r = await http('/usuarios/login', {
    metodo: 'POST', cuerpo: { email: e, password: p, dispositivo: 'movil' }
  });
  if (r.status !== 200) throw new Error('Login falló (' + r.status + '): ' + JSON.stringify(r.datos));
  return { token: r.datos.access, id: r.datos.usuario.id };
}

const ver = (texto, real, esperado) =>
  console.log((real === esperado ? 'OK    ' : 'FALLA ') + texto + ' -> ' + real + ' (esperado ' + esperado + ')');

(async () => {
  const u1 = await login(email, password);

  ver('GET sin token', (await http('/registros')).status, 401);
  ver('GET con token', (await http('/registros', { token: u1.token })).status, 200);

  const nuevo = await http('/registros', {
    metodo: 'POST', token: u1.token,
    cuerpo: { usuario_id: 999999, titulo: 'PRUEBA-borrar', descripcion: 'texto de prueba', categoria: 'Tecnología', estado: 'Borrador' }
  });
  ver('POST con token', nuevo.status, 201);
  ver('usuario_id del body se ignora (queda el tuyo)', nuevo.datos.usuario_id, u1.id);
  const id = nuevo.datos.id;

  ver('POST con estado inválido', (await http('/registros', {
    metodo: 'POST', token: u1.token, cuerpo: { titulo: 'x', descripcion: 'y', estado: 'Hackeado' }
  })).status, 400);

  const edit = { titulo: 'PRUEBA-editada', descripcion: 'otro texto', categoria: 'Tecnología', estado: 'Borrador' };
  ver('PUT propio', (await http('/registros/' + id, { metodo: 'PUT', token: u1.token, cuerpo: edit })).status, 200);
  ver('PUT de un id que no existe', (await http('/registros/999999999', { metodo: 'PUT', token: u1.token, cuerpo: edit })).status, 404);

  if (email2 && password2) {
    const u2 = await login(email2, password2);
    ver('PUT de OTRO usuario', (await http('/registros/' + id, { metodo: 'PUT', token: u2.token, cuerpo: edit })).status, 404);
    ver('DELETE de OTRO usuario', (await http('/registros/' + id, { metodo: 'DELETE', token: u2.token })).status, 404);
  } else {
    console.log('(omitido) Pruebas con otro usuario: pasa un segundo correo y contraseña al final del comando');
  }

  ver('DELETE propio', (await http('/registros/' + id, { metodo: 'DELETE', token: u1.token })).status, 200);
})().catch(e => console.error('ERROR:', e.message));