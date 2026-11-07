const { Router } = require('express');
const router = Router();
const { obtenerUsuarios, crearUsuario, loginUsuario } = require('../controllers/userController');

router.get('/', obtenerUsuarios);
router.post('/', crearUsuario);
router.post('/login', loginUsuario); // <-- Nueva ruta para iniciar sesión

module.exports = router;