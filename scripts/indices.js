require('dotenv').config();
const pool = require('../src/config/db');

async function main() {
  // 1) Un correo solo puede existir una vez, sin importar mayúsculas o minúsculas
  const dup = await pool.query(
    `SELECT lower(email) AS email, count(*) AS veces
     FROM usuarios GROUP BY lower(email) HAVING count(*) > 1`
  );
  if (dup.rows.length > 0) {
    console.log('Hay correos duplicados. Resuélvelos (borra o cambia uno de cada par) y vuelve a ejecutar:');
    console.table(dup.rows);
    return;
  }
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_lower_uq ON usuarios (lower(email))');
  console.log('OK  correo único (sin distinguir mayúsculas)');

  // 2) Acelera las consultas por dueño del artículo
  await pool.query('CREATE INDEX IF NOT EXISTS idx_registros_usuario ON registros (usuario_id)');
  console.log('OK  índice de registros por usuario');
}

main()
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => pool.end());
