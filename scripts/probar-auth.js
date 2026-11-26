require('dotenv').config();
const jwt = require('jsonwebtoken');
const base = 'http://localhost:3000/api/usuarios';
const [email, password] = process.argv.slice(2);

async function pedir(ruta, opciones = {}) {
  const r = await fetch(base + ruta, opciones);
  const datos = await r.json().catch(() => ({}));
  return { status: r.status, datos };
}
const conToken = (t) => ({ headers: { Authorization: 'Bearer ' + t } });

(async () => {
  console.log('1) Login');
  const login = await pedir('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, dispositivo: 'movil' })
  });
  console.log('   estado:', login.status);
  if (login.status !== 200) return console.log('   respuesta:', login.datos);
  const access = login.datos.access;

  console.log('2) /yo SIN token (debe dar 401 SIN_TOKEN)');
  const a = await pedir('/yo');
  console.log('  ', a.status, a.datos.codigo);

  console.log('3) /yo CON token válido (debe dar 200 y tus datos)');
  const b = await pedir('/yo', conToken(access));
  console.log('  ', b.status, JSON.stringify(b.datos));

  console.log('4) /yo con token alterado (debe dar 401 TOKEN_INVALIDO)');
  const c = await pedir('/yo', conToken(access.slice(0, -3) + 'abc'));
  console.log('  ', c.status, c.datos.codigo);

  console.log('5) /yo con token ya vencido (debe dar 401 TOKEN_EXPIRADO)');
  const vencido = jwt.sign({ id: login.datos.usuario.id }, process.env.JWT_SECRET, { expiresIn: -10 });
  const d = await pedir('/yo', conToken(vencido));
  console.log('  ', d.status, d.datos.codigo);

  console.log('6) /yo con un token firmado con otra clave (debe dar 401 TOKEN_INVALIDO)');
  const falso = jwt.sign({ id: login.datos.usuario.id }, 'clave-incorrecta', { expiresIn: '15m' });
  const e = await pedir('/yo', conToken(falso));
  console.log('  ', e.status, e.datos.codigo);
})();