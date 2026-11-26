require('dotenv').config();
const pool = require('../src/config/db');

async function main() {
  await pool.query('ALTER TABLE registros ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1');
  await pool.query('ALTER TABLE registros ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()');

  await pool.query(`
    CREATE OR REPLACE FUNCTION registros_tocar() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at := now();
      NEW.version := OLD.version + 1;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await pool.query('DROP TRIGGER IF EXISTS trg_registros_tocar ON registros');
  await pool.query(`
    CREATE TRIGGER trg_registros_tocar BEFORE UPDATE ON registros
    FOR EACH ROW EXECUTE PROCEDURE registros_tocar()
  `);

  const r = await pool.query('SELECT count(*) AS filas, min(version) AS version_minima FROM registros');
  console.log('Listo. Estado de registros:', r.rows[0]);
}

main()
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => pool.end());