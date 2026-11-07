const db = require('../config/db');

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

// Crear un nuevo usuario (Registro)
const crearUsuario = async (req, res) => {
  const { nombre, email, password } = req.body;
  try {
    const nuevoUsuario = await db.query(
      'INSERT INTO usuarios (nombre, email, password) VALUES ($1, $2, $3) RETURNING *',
      [nombre, email, password]
    );
    
    // Devolvemos el formato exacto que espera el frontend (con la propiedad "usuario")
    res.status(201).json({
      mensaje: 'Usuario registrado con éxito',
      usuario: nuevoUsuario.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar el usuario (correo posiblemente duplicado)' });
  }
};

// Iniciar Sesión (Login)
const loginUsuario = async (req, res) => {
  const { email, password } = req.body;
  try {
    const resultado = await db.query(
      'SELECT * FROM usuarios WHERE email = $1 AND password = $2',
      [email, password]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    // Devolvemos también el formato con "usuario" para que el login y registro funcionen igual
    res.status(200).json({
      mensaje: 'Login exitoso',
      usuario: resultado.rows[0]
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