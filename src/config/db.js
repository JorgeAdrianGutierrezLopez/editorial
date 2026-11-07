const { Pool } = require('pg');

const pool = new Pool({
  user: 'Coke',
  host: '172.31.177.146',
  database: 'practica_db',
  password: 'coque156',
  port: 5432,
});

module.exports = pool;