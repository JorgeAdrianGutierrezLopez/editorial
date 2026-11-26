import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

const CLAVE_REFRESH = 'refresh_token';
const OPCIONES_STORE = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

// El access token vive solo en memoria. El refresh token vive en el
// almacén seguro del teléfono (Keychain en iPhone), nunca en texto plano.
let accessToken = null;
let renovando = null;
let alTerminarSesion = () => {};

// La app registra aquí qué hacer cuando la sesión termina de verdad
export function alSesionTerminada(fn) {
  alTerminarSesion = fn;
}

// ---------- Utilidades ----------
async function pedir(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 15000);   // no esperar para siempre
  try {
    return await fetch(API_URL + ruta, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: control.signal
    });
  } finally {
    clearTimeout(reloj);
  }
}

const leerJson = async (res) => {
  try { return await res.json(); } catch { return {}; }
};

async function olvidarSesion() {
  accessToken = null;
  await SecureStore.deleteItemAsync(CLAVE_REFRESH);
}

// ---------- Sesión ----------
export async function registrar(nombre, email, password) {
  const res = await pedir('/api/usuarios/register', { metodo: 'POST', cuerpo: { nombre, email, password } });
  const datos = await leerJson(res);
  if (!res.ok) throw new Error(datos.error || 'No se pudo registrar');
  return datos;
}

export async function iniciarSesion(email, password) {
  const res = await pedir('/api/usuarios/login', {
    metodo: 'POST',
    cuerpo: { email, password, dispositivo: 'movil' }
  });
  const datos = await leerJson(res);
  if (!res.ok) throw new Error(datos.error || 'No se pudo iniciar sesión');
  accessToken = datos.access;
  await SecureStore.setItemAsync(CLAVE_REFRESH, datos.refresh, OPCIONES_STORE);
  return datos.usuario;
}

// Pide un access token nuevo con el refresh guardado. El refresh es de un solo uso:
// el servidor devuelve uno nuevo y hay que guardarlo.
// Devuelve null si la sesión terminó de verdad. Un fallo de red lanza error (NO cierra la sesión).
export function renovarAcceso() {
  if (!renovando) {
    renovando = (async () => {
      const refresh = await SecureStore.getItemAsync(CLAVE_REFRESH);
      if (!refresh) { accessToken = null; return null; }

      const res = await pedir('/api/usuarios/refresh', { metodo: 'POST', cuerpo: { refresh } });
      if (res.status === 401 || res.status === 403) {
        await olvidarSesion();
        return null;
      }
      if (!res.ok) throw new Error('Servidor no disponible');

      const datos = await leerJson(res);
      accessToken = datos.access;
      await SecureStore.setItemAsync(CLAVE_REFRESH, datos.refresh, OPCIONES_STORE);
      return accessToken;
    })().finally(() => { renovando = null; });
  }
  return renovando;
}

// Petición autenticada: renueva el token si hace falta y reintenta una vez
export async function apiFetch(ruta, opciones = {}) {
  if (!accessToken && !(await renovarAcceso())) {
    alTerminarSesion();
    return { ok: false, status: 401, json: async () => ({}) };
  }
  let res = await pedir(ruta, { ...opciones, token: accessToken });
  if (res.status === 401) {
    if (!(await renovarAcceso())) {
      alTerminarSesion();
      return res;
    }
    res = await pedir(ruta, { ...opciones, token: accessToken });
  }
  return res;
}

// Al abrir la app: si hay una sesión guardada, la recupera y devuelve el usuario
export async function restaurarSesion() {
  const refresh = await SecureStore.getItemAsync(CLAVE_REFRESH);
  if (!refresh) return null;
  if (!(await renovarAcceso())) return null;
  const res = await pedir('/api/usuarios/yo', { token: accessToken });
  if (!res.ok) return null;
  return leerJson(res);
}

export async function cerrarSesion() {
  try {
    const refresh = await SecureStore.getItemAsync(CLAVE_REFRESH);
    if (refresh) await pedir('/api/usuarios/logout', { metodo: 'POST', cuerpo: { refresh } });
  } catch {}
  await olvidarSesion();
}

export async function cerrarSesionEnTodos() {
  try { await apiFetch('/api/usuarios/logout-all', { metodo: 'POST' }); } catch {}
  await olvidarSesion();
}

// ---------- Datos ----------
async function exigirOk(res, mensajeBase) {
  if (res.ok) return leerJson(res);
  const datos = await leerJson(res);
  const error = new Error(datos.error || mensajeBase);
  error.status = res.status;
  throw error;
}

export async function listarCategorias() {
  const res = await pedir('/api/categorias');      // ruta pública
  return exigirOk(res, 'No se pudieron cargar las categorías');
}

export async function listarRegistros() {
  return exigirOk(await apiFetch('/api/registros'), 'No se pudieron cargar los artículos');
}

// Huella barata: cambia cuando alguien crea, edita o borra algo
export async function obtenerHuella() {
  const datos = await exigirOk(await apiFetch('/api/registros/version'), 'Sin huella');
  return datos.version;
}

export async function crearRegistro(datos) {
  return exigirOk(await apiFetch('/api/registros', { metodo: 'POST', cuerpo: datos }), 'No se pudo guardar');
}

export async function editarRegistro(id, datos) {
  return exigirOk(await apiFetch('/api/registros/' + id, { metodo: 'PUT', cuerpo: datos }), 'No se pudo modificar');
}

export async function borrarRegistro(id) {
  return exigirOk(await apiFetch('/api/registros/' + id, { metodo: 'DELETE' }), 'No se pudo eliminar');
}
