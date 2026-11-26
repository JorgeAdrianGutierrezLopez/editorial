import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { iniciarSesion, registrar } from '../api';

function mensajeAmigable(e) {
  if (e.name === 'AbortError') return 'El servidor tardó demasiado en responder.';
  if (e.message === 'Network request failed') return 'No se pudo conectar con el servidor.';
  return e.message;
}

export default function LoginScreen({ aviso, onEntrar }) {
  const [esRegistro, setEsRegistro] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mensaje, setMensaje] = useState(aviso ? { texto: aviso, tipo: 'aviso' } : null);
  const [cargando, setCargando] = useState(false);

  function cambiarModo(registro) {
    setEsRegistro(registro);
    setMensaje(null);
  }

  async function enviar() {
    if (cargando) return;               // evita envíos dobles (cada intento de login cuenta)
    setMensaje(null);
    setCargando(true);
    try {
      if (esRegistro) {
        await registrar(nombre.trim(), email.trim(), password);
        setEsRegistro(false);
        setPassword('');
        setMensaje({ texto: '¡Registro exitoso! Ahora inicia sesión.', tipo: 'ok' });
      } else {
        const usuario = await iniciarSesion(email.trim(), password);
        onEntrar(usuario);
        return;                          // esta pantalla se cierra
      }
    } catch (e) {
      setMensaje({ texto: mensajeAmigable(e), tipo: 'error' });
    }
    setCargando(false);
  }

  const colorMensaje = { ok: '#16a34a', error: '#dc2626', aviso: '#b45309' };

  return (
    <SafeAreaView style={estilos.pantalla}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <Text style={estilos.logo}>📰 Mini CMS</Text>
          <Text style={estilos.subtitulo}>Panel de Redacción</Text>

          <View style={estilos.tarjeta}>
            <View style={estilos.pestanas}>
              <TouchableOpacity style={[estilos.pestana, !esRegistro && estilos.pestanaActiva]} onPress={() => cambiarModo(false)}>
                <Text style={[estilos.pestanaTexto, !esRegistro && estilos.pestanaTextoActivo]}>Iniciar sesión</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[estilos.pestana, esRegistro && estilos.pestanaActiva]} onPress={() => cambiarModo(true)}>
                <Text style={[estilos.pestanaTexto, esRegistro && estilos.pestanaTextoActivo]}>Registrarse</Text>
              </TouchableOpacity>
            </View>

            {esRegistro && (
              <>
                <Text style={estilos.etiqueta}>Nombre completo</Text>
                <TextInput style={estilos.campo} value={nombre} onChangeText={setNombre} placeholder="Ej: Ana Pérez" maxLength={100} />
              </>
            )}

            <Text style={estilos.etiqueta}>Correo electrónico</Text>
            <TextInput
              style={estilos.campo}
              value={email}
              onChangeText={setEmail}
              placeholder="correo@ejemplo.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />

            <Text style={estilos.etiqueta}>Contraseña{esRegistro ? ' (mínimo 8 caracteres)' : ''}</Text>
            <TextInput
              style={estilos.campo}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={esRegistro ? 72 : 256}
              textContentType={esRegistro ? 'newPassword' : 'password'}
              onSubmitEditing={enviar}
            />

            <TouchableOpacity style={[estilos.boton, cargando && estilos.botonInactivo]} onPress={enviar} disabled={cargando}>
              {cargando
                ? <ActivityIndicator color="#fff" />
                : <Text style={estilos.botonTexto}>{esRegistro ? 'Registrar cuenta' : 'Entrar al sistema'}</Text>}
            </TouchableOpacity>

            {mensaje && (
              <Text style={[estilos.mensaje, { color: colorMensaje[mensaje.tipo] }]}>{mensaje.texto}</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#f1f5f9' },
  contenido: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  logo: { fontSize: 30, fontWeight: '800', color: '#1e293b', textAlign: 'center' },
  subtitulo: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 20 },
  tarjeta: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  pestanas: { flexDirection: 'row', marginBottom: 16, borderBottomWidth: 2, borderBottomColor: '#e2e8f0' },
  pestana: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent', marginBottom: -2 },
  pestanaActiva: { borderBottomColor: '#2563eb' },
  pestanaTexto: { color: '#64748b', fontWeight: '600' },
  pestanaTextoActivo: { color: '#2563eb' },
  etiqueta: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  campo: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 14, backgroundColor: '#fff' },
  boton: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  botonInactivo: { opacity: 0.6 },
  botonTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  mensaje: { textAlign: 'center', marginTop: 14, fontSize: 13, fontWeight: '700' }
});
