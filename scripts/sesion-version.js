require('dotenv').config();
const pool = require('../src/config/db');

async function main() {
  await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sesion_version INTEGER NOT NULL DEFAULT 0');
  const r = await pool.query('SELECT count(*) AS usuarios, max(sesion_version) AS version_maxima FROM usuarios');
  console.log('Listo. Columna sesion_version disponible:', r.rows[0]);
}

main()
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => pool.end());
