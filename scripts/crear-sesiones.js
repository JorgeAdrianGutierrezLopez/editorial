require('dotenv').config();
const pool = require('../src/config/db');

async function main() {
  // 1. Detectar qué tipo de dato usa usuarios.id, para que la tabla nueva sea compatible
  const r = await pool.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'usuarios' AND column_name = 'id'`
  );
  if (r.rows.length === 0) {
    throw new Error('No encontré la tabla usuarios o su columna id. Revisa DATABASE_URL.');
  }
  const mapa = { integer: 'INTEGER', bigint: 'BIGINT', uuid: 'UUID' };
  const tipo = mapa[r.rows[0].data_type];
  if (!tipo) throw new Error('Tipo de id no esperado: ' + r.rows[0].data_type);
  console.log('Tipo de usuarios.id:', tipo);

  // 2. Crear la tabla de sesiones
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sesiones (
      id SERIAL PRIMARY KEY,
      usuario_id ${tipo} NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      dispositivo TEXT DEFAULT 'web',
      creada_en TIMESTAMPTZ DEFAULT now(),
      expira TIMESTAMPTZ NOT NULL,
      revocada BOOLEAN DEFAULT false
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id)'
  );

  // 3. Agregar updated_at a registros
  await pool.query(
    'ALTER TABLE registros ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()'
  );

  // 4. Mostrar el resultado para comprobarlo
  const s = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'sesiones' ORDER BY ordinal_position`
  );
  console.log('\nColumnas de sesiones:');
  console.table(s.rows);

  const u = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'registros' AND column_name = 'updated_at'`
  );
  console.log('registros.updated_at existe:', u.rows.length === 1);
}

main()
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => pool.end());