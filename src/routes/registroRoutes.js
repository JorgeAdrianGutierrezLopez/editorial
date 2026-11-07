const { Router } = require('express');
const router = Router();
const { Pool } = require('pg');

// Configuración de conexión segura adaptada para la nube
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Obtener todos los artículos
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM registros ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener artículos' });
    }
});

// Crear nuevo artículo
router.post('/', async (req, res) => {
    const { usuario_id, titulo, descripcion, categoria, estado } = req.body;
    try {
        const query = `
            INSERT INTO registros (usuario_id, titulo, descripcion, categoria, estado) 
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const result = await pool.query(query, [
            usuario_id, 
            titulo, 
            descripcion, 
            categoria || 'Tecnología', 
            estado || 'Publicado'
        ]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al guardar el artículo' });
    }
});

// Actualizar / Modificar un artículo existente por ID
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { titulo, descripcion, categoria, estado } = req.body;
    try {
        const query = `
            UPDATE registros 
            SET titulo = $1, descripcion = $2, categoria = $3, estado = $4 
            WHERE id = $5 RETURNING *
        `;
        const result = await pool.query(query, [titulo, descripcion, categoria, estado, id]);
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Artículo no encontrado' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al actualizar el artículo' });
    }
});

// Eliminar un artículo por ID
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM registros WHERE id = $1', [id]);
        res.json({ mensaje: 'Artículo eliminado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al eliminar artículo' });
    }
});

module.exports = router;
