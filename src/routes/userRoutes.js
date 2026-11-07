const { Router } = require('express');
const router = Router();
const { obtenerUsuarios, crearUsuario, loginUsuario } = require('../controllers/userController');

router.get('/', obtenerUsuarios);
router.post('/register', crearUsuario); // <-- Cambiado de '/' a '/register' para que coincida con el frontend
router.post('/login', loginUsuario);

module.exports = router;