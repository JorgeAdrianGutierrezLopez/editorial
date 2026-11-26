const usuarioNombre = localStorage.getItem('usuario_nombre') || 'Redactor';
document.getElementById('saludoUsuario').innerText = `👤 ${usuarioNombre}`;

// Cargar Categorías Dinámicamente desde la BD (ruta pública)
async function cargarCategorias() {
    try {
        const res = await fetch('/api/categorias');
        const categorias = await res.json();
        const select = document.getElementById('categoria');
        let opciones = '<option value="">-- Selecciona una categoría --</option>';
        categorias.forEach(cat => {
            opciones += `<option value="${esc(cat.nombre)}">${esc(cat.nombre)}</option>`;
        });
        select.innerHTML = opciones;
    } catch (err) {
        console.error('Error al cargar categorías:', err);
    }
}

// Artículos cargados, por id (los botones solo llevan el id, nunca texto del usuario)
let cache = {};

// Cargar Artículos en la Tabla
async function cargarRegistros() {
    try {
        const res = await apiFetch('/api/registros');
        if (!res.ok) return;
        const registros = await res.json();
        const tbody = document.getElementById('tablaRegistros');

        cache = {};

        if (registros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="no-data">No hay artículos publicados todavía.</td></tr>';
            return;
        }

        let html = '';
        registros.forEach(reg => {
            cache[reg.id] = reg;
            const cat = reg.categoria || 'General';
            const est = reg.estado || 'Publicado';

            const acciones = reg.es_mio
                ? `<div class="acciones-container">
                       <button class="btn-accion btn-modificar" data-accion="editar" data-id="${reg.id}">✏️ Modificar</button>
                       <button class="btn-accion btn-eliminar" data-accion="eliminar" data-id="${reg.id}">🗑️ Eliminar</button>
                   </div>`
                : '<span class="solo-lectura">Solo lectura</span>';

            html += `<tr>
                <td><b>#${reg.id}</b></td>
                <td>ID: ${reg.usuario_id}</td>
                <td><span class="tag-categoria">${esc(cat)}</span></td>
                <td><b>${esc(reg.titulo)}</b></td>
                <td><button class="btn-accion btn-pdf" data-accion="pdf" data-id="${reg.id}">📄 Ver PDF</button></td>
                <td><span class="tag-estado">${esc(est)}</span></td>
                <td>${acciones}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (err) {
        console.error('Error al cargar artículos:', err);
    }
}

function pdfDe(id) {
    const r = cache[id];
    if (!r) return;
    descargarPDF(r.titulo, r.categoria || 'General', r.estado || 'Publicado', r.descripcion);
}

function editarDe(id) {
    const r = cache[id];
    if (!r) return;
    prepararEdicion(r.id, r.titulo, r.categoria || 'General', r.estado || 'Publicado', r.descripcion);
    document.getElementById('editandoVersion').value = r.version;
}

// Generar y Descargar PDF del Artículo
function descargarPDF(titulo, categoria, estado, contenido) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Encabezado del Documento
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59); // Color de texto #1e293b
    doc.text(titulo, 20, 25);

    // Línea separadora
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.line(20, 30, 190, 30);

    // Metadatos (Categoría y Estado)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(3, 105, 161);
    doc.text(`Categoría: ${categoria}`, 20, 40);

    doc.setTextColor(21, 128, 61);
    doc.text(`Estado: ${estado}`, 120, 40);

    // Cuerpo del Contenido (con ajuste de texto automático)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(51, 65, 85);
    
    const textoDividido = doc.splitTextToSize(contenido, 170); // Ajusta el ancho al margen de la página A4
    doc.text(textoDividido, 20, 55);

    // Pie de página informativo
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("Documento generado desde Mini CMS - Panel de Redacción", 20, 280);

    // Guardar PDF con el título del artículo
    const nombreArchivo = titulo.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".pdf";
    doc.save(nombreArchivo);
}

// Preparar formulario para Modificar
function prepararEdicion(id, titulo, categoria, estado, descripcion) {
    document.getElementById('editandoId').value = id;
    document.getElementById('titulo').value = titulo;
    document.getElementById('categoria').value = categoria;
    document.getElementById('estado').value = estado;
    document.getElementById('descripcion').value = descripcion;

    document.getElementById('tituloFormulario').innerText = `Modificar Artículo #${id}`;
    document.getElementById('btnSubmit').innerText = 'Guardar Cambios';
    document.getElementById('btnSubmit').style.backgroundColor = '#ca8a04';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Eliminar Registro
async function eliminarRegistro(id) {
    if (!confirm(`¿Estás seguro de que deseas eliminar el artículo #${id}?`)) return;

    try {
        const res = await apiFetch(`/api/registros/${id}`, { method: 'DELETE' });
        if (res.ok) {
            cargarRegistros();
        } else {
            alert('No se pudo eliminar el artículo.');
        }
    } catch (err) {
        console.error(err);
    }
}

// Enviar Formulario (Crear o Actualizar)
const form = document.getElementById('registroDatoForm');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idEditando = document.getElementById('editandoId').value;
    const version = Number(document.getElementById('editandoVersion').value) || undefined;
    const titulo = document.getElementById('titulo').value;
    const categoria = document.getElementById('categoria').value;
    const estado = document.getElementById('estado').value;
    const descripcion = document.getElementById('descripcion').value;

    const url = idEditando ? `/api/registros/${idEditando}` : '/api/registros';
    const method = idEditando ? 'PUT' : 'POST';

    try {
        const res = await apiFetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo, descripcion, categoria, estado, version })
        });
        const data = await res.json();

        if (res.ok) {
            document.getElementById('mensajeRespuesta').style.color = '#16a34a';
            document.getElementById('mensajeRespuesta').innerText = idEditando ? '¡Artículo modificado con éxito!' : '¡Artículo publicado con éxito!';

            form.reset();
            document.getElementById('editandoId').value = '';
            document.getElementById('editandoVersion').value = '';
            document.getElementById('tituloFormulario').innerText = 'Redactar Nuevo Artículo';
            document.getElementById('btnSubmit').innerText = 'Publicar Artículo en BD';
            document.getElementById('btnSubmit').style.backgroundColor = '#2563eb';

            cargarRegistros();
        } else {
            document.getElementById('mensajeRespuesta').style.color = '#dc2626';
            document.getElementById('mensajeRespuesta').innerText = data.error || 'Error al procesar la solicitud';
            if (res.status === 409) cargarRegistros();
        }
    } catch (err) {
        console.error(err);
        document.getElementById('mensajeRespuesta').style.color = '#dc2626';
        document.getElementById('mensajeRespuesta').innerText = 'Error de conexión';
    }
});

// Botones (un solo escuchador para toda la tabla; los botones solo llevan el id)
document.getElementById('tablaRegistros').addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (!boton) return;
    const id = Number(boton.dataset.id);
    if (boton.dataset.accion === 'pdf') pdfDe(id);
    else if (boton.dataset.accion === 'editar') editarDe(id);
    else if (boton.dataset.accion === 'eliminar') eliminarRegistro(id);
});
document.getElementById('btnSalir').addEventListener('click', cerrarSesion);
document.getElementById('btnSalirTodo').addEventListener('click', cerrarSesionEnTodos);

// Inicializar
cargarCategorias();
iniciarSincronizacion(cargarRegistros);
    
