const base = 'http://localhost:3000/api/usuarios';
const [email, password] = process.argv.slice(2);

async function post(ruta, cuerpo) {
  const r = await fetch(base + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  const datos = await r.json().catch(() => ({}));
  return { status: r.status, datos };
}

(async () => {
  console.log('1) Login (modo móvil)');
  const login = await post('/login', { email, password, dispositivo: 'movil' });
  console.log('   estado:', login.status, '| access:', !!login.datos.access, '| refresh:', !!login.datos.refresh);
  if (login.status !== 200) return console.log('   respuesta:', login.datos);

  console.log('2) Renovar con el refresh (debe dar 200 y tokens nuevos)');
  const r1 = await post('/refresh', { refresh: login.datos.refresh });
  console.log('   estado:', r1.status, '| access nuevo:', !!r1.datos.access, '| refresh nuevo:', !!r1.datos.refresh);

  console.log('3) Reusar el refresh viejo (debe dar 401)');
  const r2 = await post('/refresh', { refresh: login.datos.refresh });
  console.log('   estado:', r2.status);

  console.log('4) Cerrar sesión con el refresh nuevo (debe dar 200)');
  const out = await post('/logout', { refresh: r1.datos.refresh });
  console.log('   estado:', out.status);

  console.log('5) Renovar después del logout (debe dar 401)');
  const r3 = await post('/refresh', { refresh: r1.datos.refresh });
  console.log('   estado:', r3.status);
})();