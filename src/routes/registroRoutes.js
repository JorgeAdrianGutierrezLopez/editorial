const { Router } = require('express');
const { z } = require('zod');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = Router();

// Todas las rutas de este archivo exigen sesión
router.use(auth);

// Reglas de los datos que acepta la API
const registroSchema = z.object({
    titulo: z.string().trim().min(1).max(200),
    descripcion: z.string().trim().min(1).max(20000),
    categoria: z.string().trim().min(1).max(100).default('Tecnología'),
    estado: z.enum(['Publicado', 'Borrador']).default('Publicado')
});

// Al modificar, el cliente puede mandar la versión que tenía para detectar choques
const edicionSchema = registroSchema.extend({
    version: z.number().int().positive().optional()
});

const idSchema = z.coerce.number().int().positive();

function validar(schema, datos, res) {
    const r = schema.safeParse(datos ?? {});
    if (!r.success) {
        res.status(400).json({
            error: 'Datos inválidos',
            detalle: r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        });
        return null;
    }
    return r.data;
}

// Leer artículos. es_mio le dice al cliente cuáles puede editar o borrar.
// (Para que cada usuario vea SOLO los suyos: cambia la consulta por
//  'SELECT *, true AS es_mio FROM registros WHERE usuario_id = $1 ORDER BY id DESC')
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT *, (usuario_id = $1) AS es_mio FROM registros ORDER BY id DESC',
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener artículos' });
    }
});

// Huella barata del estado de la tabla: cambia si se crea, edita o borra algo
router.get('/version', async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT count(*) AS n, coalesce(max(id), 0) AS max_id, coalesce(sum(version), 0) AS suma
             FROM registros`
        );
        const { n, max_id, suma } = r.rows[0];
        res.set('Cache-Control', 'no-store');
        res.json({ version: `${n}-${max_id}-${suma}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al consultar la versión' });
    }
});

// Crear: el autor SIEMPRE sale del token, nunca del body
router.post('/', async (req, res) => {
    const d = validar(registroSchema, req.body, res);
    if (!d) return;
    try {
        const result = await pool.query(
            `INSERT INTO registros (usuario_id, titulo, descripcion, categoria, estado)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.user.id, d.titulo, d.descripcion, d.categoria, d.estado]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al guardar el artículo' });
    }
});

// Modificar: solo si el artículo es tuyo y, si el cliente manda version, solo si sigue vigente
router.put('/:id', async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'ID inválido' });
    const d = validar(edicionSchema, req.body, res);
    if (!d) return;
    try {
        const result = await pool.query(
            `UPDATE registros
             SET titulo = $1, descripcion = $2, categoria = $3, estado = $4,
                 updated_at = now(), version = version + 1
             WHERE id = $5 AND usuario_id = $6 AND ($7::int IS NULL OR version = $7)
             RETURNING *`,
            [d.titulo, d.descripcion, d.categoria, d.estado, id.data, req.user.id, d.version ?? null]
        );
        if (result.rows.length > 0) return res.json(result.rows[0]);

        // No se actualizó nada: ¿es un choque de versiones o no existe / no es tuyo?
        const existe = await pool.query(
            'SELECT * FROM registros WHERE id = $1 AND usuario_id = $2',
            [id.data, req.user.id]
        );
        if (existe.rows.length > 0) {
            return res.status(409).json({
                error: 'Este artículo cambió desde otro dispositivo. Se actualizó la lista; ábrelo de nuevo con Modificar.',
                actual: existe.rows[0]
            });
        }
        res.status(404).json({ error: 'Artículo no encontrado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al actualizar el artículo' });
    }
});

// Eliminar: solo si el artículo es tuyo
router.delete('/:id', async (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'ID inválido' });
    try {
        const result = await pool.query(
            'DELETE FROM registros WHERE id = $1 AND usuario_id = $2 RETURNING id',
            [id.data, req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Artículo no encontrado' });
        }
        res.json({ mensaje: 'Artículo eliminado correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al eliminar artículo' });
    }
});

module.exports = router;
