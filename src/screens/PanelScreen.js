import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  borrarRegistro, cerrarSesion, cerrarSesionEnTodos, crearRegistro, editarRegistro,
  listarCategorias, listarRegistros, obtenerHuella
} from '../api';

const ESTADOS = ['Publicado', 'Borrador'];
const FORM_VACIO = { id: null, version: undefined, titulo: '', descripcion: '', categoria: '', estado: 'Publicado' };
const CADA_MS = 8000;

function mensajeAmigable(e) {
  if (e.name === 'AbortError') return 'El servidor tardó demasiado en responder.';
  if (e.message === 'Network request failed') return 'Sin conexión con el servidor.';
  return e.message;
}

export default function PanelScreen({ usuario, onSalir }) {
  const [registros, setRegistros] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);
  const [form, setForm] = useState(null);           // null = formulario cerrado
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const huellaRef = useRef(null);
  const ocupadoRef = useRef(false);

  const cargar = useCallback(async () => {
    setRegistros(await listarRegistros());
  }, []);

  // Sincronización: consulta la "huella" y solo recarga la lista si cambió
  const revisar = useCallback(async () => {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    try {
      const huella = await obtenerHuella();
      if (huella !== huellaRef.current) {
        await cargar();
        huellaRef.current = huella;
      }
      setSinConexion(false);
    } catch (e) {
      if (e.status !== 401) setSinConexion(true);   // sin red: se reintenta en el siguiente ciclo
    } finally {
      ocupadoRef.current = false;
      setCargandoInicial(false);
    }
  }, [cargar]);

  useEffect(() => {
    listarCategorias().then(setCategorias).catch(() => {});
    revisar();
    const reloj = setInterval(() => {
      if (AppState.currentState === 'active') revisar();   // en segundo plano no consulta nada
    }, CADA_MS);
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') revisar();                   // al volver a la app, revisa de inmediato
    });
    return () => { clearInterval(reloj); suscripcion.remove(); };
  }, [revisar]);

  async function recargarTrasCambio() {
    await cargar();
    try { huellaRef.current = await obtenerHuella(); } catch (e) {}
  }

  async function alDeslizar() {
    setRefrescando(true);
    try {
      await recargarTrasCambio();
      setSinConexion(false);
    } catch (e) {
      setSinConexion(true);
    }
    setRefrescando(false);
  }

  // ---------- Formulario ----------
  function abrirNuevo() {
    setErrorForm('');
    setForm({ ...FORM_VACIO, categoria: categorias[0] ? categorias[0].nombre : '' });
  }

  function abrirEdicion(r) {
    setErrorForm('');
    setForm({
      id: r.id, version: r.version, titulo: r.titulo, descripcion: r.descripcion,
      categoria: r.categoria || '', estado: r.estado || 'Publicado'
    });
  }

  async function guardar() {
    if (!form.titulo.trim() || !form.descripcion.trim() || !form.categoria) {
      setErrorForm('Completa el titular, la categoría y el contenido.');
      return;
    }
    setGuardando(true);
    setErrorForm('');
    const datos = {
      titulo: form.titulo.trim(), descripcion: form.descripcion.trim(),
      categoria: form.categoria, estado: form.estado
    };
    try {
      if (form.id) await editarRegistro(form.id, { ...datos, version: form.version });
      else await crearRegistro(datos);
      setForm(null);
      await recargarTrasCambio();
    } catch (e) {
      if (e.status === 409) {
        // Otro dispositivo modificó este artículo antes que tú
        setForm(null);
        Alert.alert('El artículo cambió', e.message);
        recargarTrasCambio().catch(() => {});
      } else {
        setErrorForm(mensajeAmigable(e));
      }
    }
    setGuardando(false);
  }

  function confirmarBorrado(r) {
    Alert.alert('Eliminar artículo', `¿Seguro que quieres eliminar el artículo #${r.id}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await borrarRegistro(r.id);
            await recargarTrasCambio();
          } catch (e) {
            Alert.alert('No se pudo eliminar', mensajeAmigable(e));
          }
        }
      }
    ]);
  }

  // ---------- Sesión ----------
  function menuSalir() {
    Alert.alert('Cerrar sesión', '¿Dónde quieres cerrar la sesión?', [
      { text: 'Solo en este teléfono', onPress: async () => { await cerrarSesion(); onSalir(); } },
      { text: 'En todos mis dispositivos', style: 'destructive', onPress: async () => { await cerrarSesionEnTodos(); onSalir(); } },
      { text: 'Cancelar', style: 'cancel' }
    ]);
  }

  // ---------- Vista ----------
  function renderRegistro({ item: r }) {
    const publicado = (r.estado || 'Publicado') === 'Publicado';
    return (
      <View style={estilos.tarjeta}>
        <View style={estilos.filaChips}>
          <Text style={estilos.chipCategoria}>{r.categoria || 'General'}</Text>
          <Text style={[estilos.chipEstado, publicado ? estilos.estadoPublicado : estilos.estadoBorrador]}>
            {r.estado || 'Publicado'}
          </Text>
        </View>
        <Text style={estilos.tituloRegistro}>{r.titulo}</Text>
        <Text style={estilos.contenidoRegistro} numberOfLines={3}>{r.descripcion}</Text>
        <Text style={estilos.meta}>#{r.id} · Autor ID: {r.usuario_id}</Text>
        {r.es_mio ? (
          <View style={estilos.acciones}>
            <TouchableOpacity style={[estilos.accion, estilos.accionEditar]} onPress={() => abrirEdicion(r)}>
              <Text style={estilos.accionEditarTexto}>✏️ Modificar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[estilos.accion, estilos.accionBorrar]} onPress={() => confirmarBorrado(r)}>
              <Text style={estilos.accionBorrarTexto}>🗑️ Eliminar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={estilos.soloLectura}>Solo lectura</Text>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.cabeceraTitulo}>📰 Mini CMS</Text>
          <Text style={estilos.cabeceraUsuario}>👤 {usuario ? usuario.nombre : ''}</Text>
        </View>
        <TouchableOpacity style={estilos.botonSalir} onPress={menuSalir}>
          <Text style={estilos.botonSalirTexto}>Salir</Text>
        </TouchableOpacity>
      </View>

      {sinConexion && (
        <View style={estilos.bannerSinRed}>
          <Text style={estilos.bannerTexto}>Sin conexión con el servidor. Reintentando…</Text>
        </View>
      )}

      {cargandoInicial ? (
        <View style={estilos.centro}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={registros}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderRegistro}
          contentContainerStyle={estilos.lista}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={alDeslizar} />}
          ListEmptyComponent={<Text style={estilos.vacio}>No hay artículos publicados todavía.</Text>}
        />
      )}

      <TouchableOpacity style={estilos.fab} onPress={abrirNuevo}>
        <Text style={estilos.fabTexto}>＋ Nuevo</Text>
      </TouchableOpacity>

      <Modal visible={!!form} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setForm(null)}>
        {form && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={estilos.formulario} keyboardShouldPersistTaps="handled">
              <Text style={estilos.formTitulo}>{form.id ? `Modificar artículo #${form.id}` : 'Redactar nuevo artículo'}</Text>

              <Text style={estilos.etiqueta}>Titular</Text>
              <TextInput
                style={estilos.campo} value={form.titulo} maxLength={200}
                onChangeText={(t) => setForm({ ...form, titulo: t })}
                placeholder="Ej: Avances tecnológicos en 2026"
              />

              <Text style={estilos.etiqueta}>Categoría</Text>
              <View style={estilos.opciones}>
                {categorias.map((c) => (
                  <TouchableOpacity
                    key={c.id ?? c.nombre}
                    style={[estilos.opcion, form.categoria === c.nombre && estilos.opcionActiva]}
                    onPress={() => setForm({ ...form, categoria: c.nombre })}
                  >
                    <Text style={[estilos.opcionTexto, form.categoria === c.nombre && estilos.opcionTextoActivo]}>{c.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={estilos.etiqueta}>Estado</Text>
              <View style={estilos.opciones}>
                {ESTADOS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[estilos.opcion, form.estado === e && estilos.opcionActiva]}
                    onPress={() => setForm({ ...form, estado: e })}
                  >
                    <Text style={[estilos.opcionTexto, form.estado === e && estilos.opcionTextoActivo]}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={estilos.etiqueta}>Contenido</Text>
              <TextInput
                style={[estilos.campo, estilos.campoLargo]} value={form.descripcion} multiline
                onChangeText={(t) => setForm({ ...form, descripcion: t })}
                placeholder="Escribe el contenido completo..." textAlignVertical="top"
              />

              {!!errorForm && <Text style={estilos.errorForm}>{errorForm}</Text>}

              <TouchableOpacity style={[estilos.botonGuardar, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
                {guardando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.botonGuardarTexto}>{form.id ? 'Guardar cambios' : 'Publicar artículo'}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={estilos.botonCancelar} onPress={() => setForm(null)} disabled={guardando}>
                <Text style={estilos.botonCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#f1f5f9' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  cabeceraTitulo: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  cabeceraUsuario: { fontSize: 13, color: '#475569', marginTop: 2 },
  botonSalir: { backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  botonSalirTexto: { color: '#fff', fontWeight: '700' },
  bannerSinRed: { backgroundColor: '#fef3c7', paddingVertical: 8, paddingHorizontal: 16 },
  bannerTexto: { color: '#92400e', fontSize: 13, textAlign: 'center' },
  lista: { padding: 14, paddingBottom: 100 },
  vacio: { textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', marginTop: 40 },
  tarjeta: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  filaChips: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chipCategoria: { backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: 11, fontWeight: '700', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 12, overflow: 'hidden' },
  chipEstado: { fontSize: 11, fontWeight: '700', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 12, overflow: 'hidden' },
  estadoPublicado: { backgroundColor: '#dcfce7', color: '#15803d' },
  estadoBorrador: { backgroundColor: '#fef3c7', color: '#92400e' },
  tituloRegistro: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 6 },
  contenidoRegistro: { fontSize: 14, color: '#475569', lineHeight: 20 },
  meta: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
  acciones: { flexDirection: 'row', gap: 8, marginTop: 12 },
  accion: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  accionEditar: { backgroundColor: '#fef08a' },
  accionEditarTexto: { color: '#854d0e', fontWeight: '700', fontSize: 13 },
  accionBorrar: { backgroundColor: '#fee2e2' },
  accionBorrarTexto: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
  soloLectura: { color: '#94a3b8', fontSize: 12, marginTop: 12 },
  fab: { position: 'absolute', right: 18, bottom: 28, backgroundColor: '#2563eb', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabTexto: { color: '#fff', fontWeight: '800', fontSize: 15 },
  formulario: { padding: 20 },
  formTitulo: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginBottom: 16 },
  etiqueta: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  campo: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 14, backgroundColor: '#fff' },
  campoLargo: { height: 160 },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  opcion: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: '#fff' },
  opcionActiva: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  opcionTexto: { color: '#475569', fontWeight: '600', fontSize: 13 },
  opcionTextoActivo: { color: '#fff' },
  errorForm: { color: '#dc2626', fontWeight: '700', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  botonGuardar: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  botonGuardarTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },
  botonCancelar: { paddingVertical: 14, alignItems: 'center' },
  botonCancelarTexto: { color: '#64748b', fontWeight: '600' }
});
