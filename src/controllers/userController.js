const db = require('../config/db');
const bcrypt = require('bcrypt'); // <-- 1. Importamos bcrypt

// Objeto temporal en memoria para llevar los intentos fallidos por correo
const intentosLogin = {};

// Obtener todos los usuarios
const obtenerUsuarios = async (req, res) => {
  try {
    const response = await db.query('SELECT id, nombre, email FROM usuarios');
    res.status(200).json(response.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
};

// Crear un nuevo usuario (Registro con Contraseña Hasheada)
const crearUsuario = async (req, res) => {
  const { nombre, email, password } = req.body;
  try {
    // 2. Encriptar la contraseña antes de guardarla en la base de datos
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const nuevoUsuario = await db.query(
      'INSERT INTO usuarios (nombre, email, password) VALUES ($1, $2, $3) RETURNING id, nombre, email', // Omitimos regresar el password por seguridad
      [nombre, email, hashedPassword] // <-- Guardamos el hash, no el texto plano
    );
    
    res.status(201).json({
      mensaje: 'Usuario registrado con éxito',
      usuario: nuevoUsuario.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar el usuario (correo posiblemente duplicado)' });
  }
};

// Iniciar Sesión (Login validando con Hash y Control de Intentos)
const loginUsuario = async (req, res) => {
  const { email, password } = req.body;
  const ahora = Date.now();

  // 1. Verificar si el usuario está bloqueado temporalmente por agotar sus intentos
  if (intentosLogin[email] && intentosLogin[email].bloqueadoHasta > ahora) {
    const minutosRestantes = Math.ceil((intentosLogin[email].bloqueadoHasta - ahora) / 60000);
    return res.status(429).json({ 
      error: `Demasiados intentos fallidos. Cuenta bloqueada temporalmente. Inténtalo en ${minutosRestantes} minuto(s).` 
    });
  }

  try {
    // 2. Buscamos al usuario solo por su correo
    const resultado = await db.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const usuario = resultado.rows[0];

    // 3. Comparamos la contraseña escrita con el hash de la base de datos
    const passwordMatch = await bcrypt.compare(password, usuario.password);
    if (!passwordMatch) {
      // Inicializar el registro de intentos si no existe para este correo
      if (!intentosLogin[email]) {
        intentosLogin[email] = { count: 0, bloqueadoHasta: 0 };
      }

      intentosLogin[email].count += 1;
      const intentosRestantes = 5 - intentosLogin[email].count;

      if (intentosRestantes <= 0) {
        // Bloquear por 15 minutos (15 * 60 * 1000 ms)
        intentosLogin[email].bloqueadoHasta = ahora + (15 * 60 * 1000);
        intentosLogin[email].count = 0; // Reiniciar contador para el siguiente ciclo
        return res.status(429).json({ 
          error: 'Has agotado los 5 intentos permitidos. Tu cuenta ha sido bloqueada por 15 minutos.' 
        });
      }

      return res.status(401).json({ 
        error: `Usuario o contraseña incorrectos. Te quedan ${intentosRestantes} intentos.` 
      });
    }

    // Si el login es exitoso, limpiamos el contador de intentos fallidos de este usuario
    if (intentosLogin[email]) {
      delete intentosLogin[email];
    }

    // Quitamos la contraseña del objeto que devolvemos al frontend por seguridad
    const { password: _, ...usuarioSinPassword } = usuario;

    res.status(200).json({
      mensaje: 'Login exitoso',
      usuario: usuarioSinPassword
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor al iniciar sesión' });
  }
};

module.exports = {
  obtenerUsuarios,
  crearUsuario,
  loginUsuario
};