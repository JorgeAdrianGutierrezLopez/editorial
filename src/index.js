require('dotenv').config();

// En producción exigimos una clave larga para firmar los tokens
if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET || '').length < 32) {
    throw new Error('En producción JWT_SECRET debe tener al menos 32 caracteres');
}
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const pool = require('./config/db');

// Capturar errores no manejados para que Render imprima el motivo exacto en los logs si algo falla al iniciar
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (uncaughtException):', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (unhandledRejection):', reason);
    process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3000;
const esProduccion = process.env.NODE_ENV === 'production';

// Render usa un proxy: sin esto, el limitador de intentos vería la IP
// del proxy y no la de cada usuario
app.set('trust proxy', 1);

// ==========================================
// SEGURIDAD: CABECERAS HTTP Y POLÍTICA DE CONTENIDO (CSP)
// ==========================================
// La CSP le dice al navegador qué scripts, estilos e imágenes puede cargar.
// Aunque alguien lograra inyectar HTML en una página, el navegador
// se negaría a ejecutar su script.
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            'script-src-attr': ["'none'"],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'],
            'connect-src': ["'self'"],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"],
            'frame-ancestors': ["'none'"],
            // En local (http) este aviso rompe algunos navegadores; solo se activa en producción
            'upgrade-insecure-requests': esProduccion ? [] : null
        }
    }
}));

// CORS: solo los orígenes que tú listes en el .env (separados por coma).
// Si no pones ninguno, solo se acepta el mismo origen (tu propia web).
const origenesPermitidos = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({ origin: origenesPermitidos.length ? origenesPermitidos : false }));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Render consulta esta ruta para saber que el servidor está vivo (no usa la base de datos)
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Servir archivos estáticos desde la carpeta "public"
// Las páginas HTML no se guardan en caché (así "atrás" no revive una sesión cerrada)
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, archivo) => {
        if (archivo.endsWith('.html')) res.set('Cache-Control', 'no-store');
    }
}));

// ==========================================
// SEGURIDAD: PROTECCIÓN CONTRA FUERZA BRUTA
// ==========================================
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Ventana de 15 minutos
    max: 5, // Máximo 5 intentos permitidos
    message: {
        error: 'Demasiados intentos de inicio de sesión. Por seguridad, tu IP ha sido bloqueada temporalmente por 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 10,                  // 10 registros por IP y hora
    message: { error: 'Demasiados registros desde esta red. Inténtalo más tarde.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Aplicar los limitadores exclusivamente a estas rutas de la API
app.use('/api/usuarios/login', loginLimiter);
app.use('/api/usuarios/register', registerLimiter);

// ==========================================
// RUTAS DE VISTAS (FRONTEND)
// ==========================================
app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ==========================================
// RUTAS DE LA API - CATEGORÍAS
// ==========================================
app.get('/api/categorias', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categorias ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
});

// ==========================================
// IMPORTAR RUTAS EXTERNAS
// ==========================================
const userRoutes = require('./routes/userRoutes'); 
const registroRoutes = require('./routes/registroRoutes'); 

app.use('/api/usuarios', userRoutes);
app.use('/api/registros', registroRoutes);

// Errores no previstos (por ejemplo, un JSON mal formado): respuesta limpia, sin detalles internos
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON inválido' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// ==========================================
// LIMPIEZA PERIÓDICA DE SESIONES VIEJAS
// ==========================================
async function limpiarSesiones() {
    try {
        await pool.query(
            `DELETE FROM sesiones
             WHERE expira < now() OR (revocada = true AND creada_en < now() - interval '7 days')`
        );
    } catch (err) {
        console.error('No se pudieron limpiar sesiones viejas:', err.message);
    }
}
limpiarSesiones();
setInterval(limpiarSesiones, 6 * 60 * 60 * 1000).unref();

// Iniciar servidor
// Render exige escuchar en 0.0.0.0 y en el puerto de la variable PORT
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
