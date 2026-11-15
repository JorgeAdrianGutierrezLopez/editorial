// Objeto temporal en memoria para llevar los intentos por correo (puedes ajustarlo)
const intentosLogin = {};

const loginUsuario = async (req, res) => {
    const { email, password } = req.body;
    
    // Verificar si el usuario está bloqueado temporalmente
    const ahora = Date.now();
    if (intentosLogin[email] && intentosLogin[email].bloqueadoHasta > ahora) {
        const minutosRestantes = Math.ceil((intentosLogin[email].bloqueadoHasta - ahora) / 60000);
        return res.status(429).json({ 
            error: `Demasiados intentos fallidos. Cuenta bloqueada temporalmente. Inténtalo en ${minutosRestantes} minutos.` 
        });
    }

    try {
        // Buscar usuario en la base de datos
        const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        
        if (resultado.rows.length === 0) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }

        const usuario = resultado.rows[0];
        const passwordMatch = await bcrypt.compare(password, usuario.password);

        if (!passwordMatch) {
            // Inicializar el registro de intentos si no existe
            if (!intentosLogin[email]) {
                intentosLogin[email] = { count: 0, bloqueadoHasta: 0 };
            }

            intentosLogin[email].count += 1;
            const intentosRestantes = 5 - intentosLogin[email].count;

            if (intentosRestantes <= 0) {
                // Bloquear por 15 minutos
                intentosLogin[email].bloqueadoHasta = ahora + (15 * 60 * 1000);
                intentosLogin[email].count = 0; // Reiniciar contador para el próximo ciclo
                return res.status(429).json({ 
                    error: 'Has agotado los 5 intentos permitidos. Tu cuenta ha sido bloqueada por 15 minutos.' 
                });
            }

            return res.status(401).json({ 
                error: `Usuario o contraseña incorrectos. Te quedan ${intentosRestantes} intentos.` 
            });
        }

        // Si el login es exitoso, reiniciamos el contador de intentos fallidos
        if (intentosLogin[email]) {
            delete intentosLogin[email];
        }

        // Quitar la contraseña del objeto que devolvemos al frontend por seguridad
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