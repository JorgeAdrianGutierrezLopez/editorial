const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { z } = require('zod');

if (!process.env.JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en las variables de entorno (.env)');
}

const ACCESS_DURACION = '15m';
const REFRESH_DIAS = 30;
const esProduccion = process.env.NODE_ENV === 'production';

// ---------- Validación de datos de entrada ----------
const emailSchema = z.string().trim().toLowerCase()
  .email('Correo electrónico inválido')
  .max(254, 'El correo es demasiado largo');

const registroSchema = z.object({
  nombre: z.string().trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),
  email: emailSchema,
  // bcrypt solo usa los primeros 72 bytes de la contraseña
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'La contraseña es demasiado larga (máximo 72 caracteres)')
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
  dispositivo: z.string().optional()
});

// ---------- Bloqueo por intentos fallidos (en memoria) ----------
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const intentosLogin = new Map(); // email -> { count, desde, bloqueadoHasta }

function minutosDeBloqueo(email, ahora) {
  const e = intentosLogin.get(email);
  return e && e.bloqueadoHasta > ahora ? Math.ceil((e.bloqueadoHasta - ahora) / 60000) : 0;
}

function registrarFallo(email, ahora) {
  let e = intentosLogin.get(email);
  if (!e || ahora - e.desde > BLOQUEO_MS) e = { count: 0, desde: ahora, bloqueadoHasta: 0 };
  e.count += 1;
  if (e.count >= MAX_INTENTOS) e.bloqueadoHasta = ahora + BLOQUEO_MS;
  intentosLogin.set(email, e);
  return e;
}

// Limpia entradas viejas para que el mapa no crezca sin límite
setInterval(() => {
  const ahora = Date.now();
  for (const [email, e] of intentosLogin) {
    if (ahora - e.desde > BLOQUEO_MS && e.bloqueadoHasta < ahora) intentosLogin.delete(email);
  }
}, 10 * 60 * 1000).unref();

// Hash de relleno: si el correo no existe, igual gastamos el mismo tiempo comparando,
// para que nadie pueda descubrir qué correos están registrados midiendo la respuesta
const HASH_FALSO = bcrypt.hashSync('contraseña-de-relleno', 10);

// ---------- Utilidades de sesión ----------
const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

const crearAccessToken = (usuarioId, sesionVersion = 0) =>
  jwt.sign({ id: usuarioId, sv: sesionVersion }, process.env.JWT_SECRET, { expiresIn: ACCESS_DURACION });

// Crea un refresh token aleatorio y guarda SOLO su hash en la base de datos
async function crearSesion(usuarioId, dispositivo) {
  const refresh = crypto.randomBytes(48).toString('hex');
  await db.query(
    `INSERT INTO sesiones (usuario_id, token_hash, dispositivo, expira)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [usuarioId, sha256(refresh), dispositivo, REFRESH_DIAS]
  );
  return refresh;
}

// Web: el refresh va en una cookie httpOnly (JavaScript no puede leerla).
// Móvil: se devuelve en el JSON y la app lo guarda en su almacenamiento seguro.
function entregarRefresh(res, dispositivo, refresh) {
  if (dispositivo === 'movil') return { refresh };
  res.cookie('refresh', refresh, {
    httpOnly: true,
    secure: esProduccion,      // en producción solo viaja por HTTPS
    sameSite: 'strict',
    path: '/api/usuarios',
    maxAge: REFRESH_DIAS * 24 * 60 * 60 * 1000
  });
  return {};
}

const leerRefresh = (req) => (req.cookies && req.cookies.refresh) || (req.body && req.body.refresh);

// ---------- Obtener todos los usuarios ----------
const obtenerUsuarios = async (req, res) => {
  try {
    const response = await db.query('SELECT id, nombre, email FROM usuarios');
    res.status(200).json(response.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
};

// ---------- Datos del usuario autenticado ----------
const perfil = async (req, res) => {
  try {
    const r = await db.query('SELECT id, nombre, email FROM usuarios WHERE id = $1', [req.user.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(r.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el perfil' });
  }
};

// ---------- Registro ----------
const crearUsuario = async (req, res) => {
  const datos = registroSchema.safeParse(req.body ?? {});
  if (!datos.success) {
    return res.status(400).json({ error: datos.error.issues[0].message });
  }
  const { nombre, email, password } = datos.data;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const nuevoUsuario = await db.query(
      'INSERT INTO usuarios (nombre, email, password) VALUES ($1, $2, $3) RETURNING id, nombre, email',
      [nombre, email, hashedPassword]
    );

    res.status(201).json({
      mensaje: 'Usuario registrado con éxito',
      usuario: nuevoUsuario.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // violación de unicidad en PostgreSQL
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error al registrar el usuario' });
  }
};

// ---------- Login ----------
const loginUsuario = async (req, res) => {
  const datos = loginSchema.safeParse(req.body ?? {});
  if (!datos.success) {
    return res.status(400).json({ error: 'Correo o contraseña con formato inválido' });
  }
  const { email, password } = datos.data;
  const dispositivo = datos.data.dispositivo === 'movil' ? 'movil' : 'web';
  const ahora = Date.now();

  const minutos = minutosDeBloqueo(email, ahora);
  if (minutos > 0) {
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Cuenta bloqueada temporalmente. Inténtalo en ${minutos} minuto(s).`
    });
  }

  try {
    const resultado = await db.query('SELECT * FROM usuarios WHERE lower(email) = $1', [email]);
    const usuario = resultado.rows[0];

    // Siempre se compara contra un hash (el real o el de relleno): mismo tiempo de respuesta
    const passwordMatch = await bcrypt.compare(password, usuario ? usuario.password : HASH_FALSO);

    if (!usuario || !passwordMatch) {
      // Mismo trato y mismos mensajes exista o no el correo
      const e = registrarFallo(email, ahora);
      if (e.bloqueadoHasta > ahora) {
        return res.status(429).json({
          error: 'Has agotado los 5 intentos permitidos. Tu cuenta ha sido bloqueada por 15 minutos.'
        });
      }
      return res.status(401).json({
        error: `Usuario o contraseña incorrectos. Te quedan ${MAX_INTENTOS - e.count} intentos.`
      });
    }

    intentosLogin.delete(email);

    const { password: _, ...usuarioSinPassword } = usuario;

    const refresh = await crearSesion(usuario.id, dispositivo);

    res.status(200).json({
      mensaje: 'Login exitoso',
      usuario: usuarioSinPassword,
      access: crearAccessToken(usuario.id, usuario.sesion_version ?? 0),
      ...entregarRefresh(res, dispositivo, refresh)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor al iniciar sesión' });
  }
};

// ---------- Renovar sesión (rotación del refresh token) ----------
const refrescar = async (req, res) => {
  const token = leerRefresh(req);
  if (!token || typeof token !== 'string') return res.status(401).json({ error: 'Sin sesión' });

  try {
    // Un solo UPDATE atómico: invalida el token usado y nos dice de quién era
    const r = await db.query(
      `UPDATE sesiones SET revocada = true
       WHERE token_hash = $1 AND revocada = false AND expira > now()
       RETURNING usuario_id, dispositivo`,
      [sha256(token)]
    );

    if (r.rows.length === 0) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    const { usuario_id, dispositivo } = r.rows[0];
    const nuevoRefresh = await crearSesion(usuario_id, dispositivo);
    const v = await db.query('SELECT sesion_version FROM usuarios WHERE id = $1', [usuario_id]);

    res.json({
      access: crearAccessToken(usuario_id, v.rows[0] ? (v.rows[0].sesion_version ?? 0) : 0),
      ...entregarRefresh(res, dispositivo, nuevoRefresh)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al renovar la sesión' });
  }
};

// ---------- Cerrar sesión (este dispositivo) ----------
const logout = async (req, res) => {
  const token = leerRefresh(req);
  try {
    if (token && typeof token === 'string') {
      await db.query('UPDATE sesiones SET revocada = true WHERE token_hash = $1', [sha256(token)]);
    }
    res.clearCookie('refresh', { path: '/api/usuarios' });
    res.json({ mensaje: 'Sesión cerrada' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
};

// ---------- Cerrar sesión en TODOS los dispositivos (web y móvil) ----------
const logoutTodos = async (req, res) => {
  try {
    // 1) Ningún dispositivo podrá renovar su sesión
    await db.query(
      'UPDATE sesiones SET revocada = true WHERE usuario_id = $1 AND revocada = false',
      [req.user.id]
    );
    // 2) Los access token que ya estaban en circulación dejan de valer al instante
    await db.query('UPDATE usuarios SET sesion_version = sesion_version + 1 WHERE id = $1', [req.user.id]);
    res.clearCookie('refresh', { path: '/api/usuarios' });
    res.json({ mensaje: 'Sesión cerrada en todos los dispositivos' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al cerrar las sesiones' });
  }
};

module.exports = {
  obtenerUsuarios,
  crearUsuario,
  loginUsuario,
  refrescar,
  logout,
  logoutTodos,
  perfil
};
