// Access token solo en memoria: se pierde al cerrar o recargar la pestaña,
// y se recupera con la cookie httpOnly del refresh token.
let accessToken = null;
let renovando = null;

// Manda al usuario al login. Si venía de una sesión activa, se lo avisamos.
function irALogin() {
    const habiaSesion = !!localStorage.getItem('usuario_nombre');
    window.location.replace(habiaSesion ? '/?expirada=1' : '/');
}

function renovarAcceso() {
    // Si ya hay una renovación en curso en esta pestaña, todos esperan la misma
    // (el refresh token es de un solo uso)
    if (!renovando) {
        const pedirRenovacion = async () => {
            const r = await fetch('/api/usuarios/refresh', { method: 'POST' });
            if (r.status === 401 || r.status === 403) {   // la sesión de verdad terminó
                accessToken = null;
                return null;
            }
            if (!r.ok) throw new Error('Servidor no disponible');
            const d = await r.json();
            accessToken = d.access;
            return accessToken;
        };
        // navigator.locks coordina las pestañas del mismo navegador para que
        // no usen a la vez el mismo refresh token
        const ejecutar = navigator.locks
            ? navigator.locks.request('refresh-sesion', pedirRenovacion)
            : pedirRenovacion();
        // Un fallo de red NO cierra la sesión: el error llega a quien llamó, que ya lo maneja
        renovando = ejecutar.finally(() => { renovando = null; });
    }
    return renovando;
}

async function apiFetch(url, opciones = {}) {
    if (!accessToken && !(await renovarAcceso())) {
        irALogin();
        return new Response(null, { status: 401 });
    }
    const pedir = () => fetch(url, {
        ...opciones,
        headers: { ...(opciones.headers || {}), Authorization: 'Bearer ' + accessToken }
    });

    let res = await pedir();
    if (res.status === 401) {              // token vencido: renovar y reintentar una vez
        if (!(await renovarAcceso())) {
            irALogin();
            return res;
        }
        res = await pedir();
    }
    return res;
}

function terminarSesionLocal() {
    accessToken = null;
    localStorage.clear();
    window.location.replace('/');
}

async function cerrarSesion() {
    try { await fetch('/api/usuarios/logout', { method: 'POST' }); } catch (e) {}
    terminarSesionLocal();
}

async function cerrarSesionEnTodos() {
    if (!confirm('¿Cerrar la sesión en todos tus dispositivos (web y móvil)?')) return;
    try { await apiFetch('/api/usuarios/logout-all', { method: 'POST' }); } catch (e) {}
    terminarSesionLocal();
}

// Escapa texto para insertarlo de forma segura dentro de HTML
function esc(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Si el navegador restaura la página desde su memoria (botón "atrás"), fuerza una recarga real
window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
});

// Mantiene la pantalla al día: revisa la "huella" cada cierto tiempo y,
// solo si cambió, vuelve a cargar los datos.
function iniciarSincronizacion(alCambiar, cadaMs = 8000) {
    let ultima = null;
    let ocupado = false;

    async function revisar(forzar = false) {
        if (ocupado || (document.hidden && !forzar)) return;
        ocupado = true;
        try {
            const res = await apiFetch('/api/registros/version');
            if (!res.ok) return;
            const { version } = await res.json();
            if (version !== ultima) {
                ultima = version;
                await alCambiar();
            }
        } catch (e) {
            console.error('Sincronización:', e);
        } finally {
            ocupado = false;
        }
    }

    setInterval(() => revisar(), cadaMs);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
    window.addEventListener('focus', () => revisar());
    window.addEventListener('online', () => revisar());
    revisar(true);   // carga inicial
}