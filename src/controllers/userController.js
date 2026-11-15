const db = require('../config/db');
const bcrypt = require('bcrypt'); // <-- 1. Importamos bcrypt

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

// Iniciar Sesión (Login validando con Hash)
const loginUsuario = async (req, res) => {
  const { email, password } = req.body;
  try {
    // 3. Buscamos al usuario solo por su correo
    const resultado = await db.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    const usuario = resultado.rows[0];

    // 4. Comparamos la contraseña escrita con el hash de la base de datos
    const passwordMatch = await bcrypt.compare(password, usuario.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
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