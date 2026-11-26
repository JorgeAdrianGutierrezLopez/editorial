const { Router } = require('express');
const router = Router();
const auth = require('../middleware/auth');
const {
    obtenerUsuarios, crearUsuario, loginUsuario, refrescar, logout, logoutTodos, perfil
} = require('../controllers/userController');

router.get('/', auth, obtenerUsuarios);
router.get('/yo', auth, perfil);
router.post('/register', crearUsuario);
router.post('/login', loginUsuario);
router.post('/refresh', refrescar);
router.post('/logout', logout);
router.post('/logout-all', auth, logoutTodos);

module.exports = router;