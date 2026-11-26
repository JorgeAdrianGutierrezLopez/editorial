const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Clever Cloud exige SSL. Esta opción cifra la conexión pero no verifica el certificado del servidor.
    ssl: {
        rejectUnauthorized: false
    },
    // El plan gratuito de Clever Cloud permite muy pocas conexiones simultáneas
    max: Number(process.env.DB_POOL_MAX) || 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000
});

// Sin este escuchador, un corte de una conexión inactiva tumbaría todo el servidor
pool.on('error', (err) => {
    console.error('Error inesperado en una conexión inactiva de la base de datos:', err.message);
});

module.exports = pool;
