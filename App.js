import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { alSesionTerminada, restaurarSesion } from './src/api';
import { API_URL } from './src/config';
import LoginScreen from './src/screens/LoginScreen';
import PanelScreen from './src/screens/PanelScreen';

export default function App() {
  const [pantalla, setPantalla] = useState('cargando');   // cargando | login | panel | sinRed
  const [usuario, setUsuario] = useState(null);
  const [aviso, setAviso] = useState('');

  // Si la sesión termina (por ejemplo, la cerraste desde la web), volvemos al login
  useEffect(() => {
    alSesionTerminada(() => {
      setUsuario(null);
      setAviso('Tu sesión terminó. Inicia sesión de nuevo.');
      setPantalla('login');
    });
  }, []);

  // Al abrir la app: intenta recuperar la sesión guardada en el almacén seguro
  const iniciar = useCallback(async () => {
    setPantalla('cargando');
    try {
      const u = await restaurarSesion();
      if (u) {
        setUsuario(u);
        setPantalla('panel');
      } else {
        setPantalla('login');
      }
    } catch (e) {
      setPantalla('sinRed');
    }
  }, []);

  useEffect(() => { iniciar(); }, [iniciar]);

  const alEntrar = (u) => { setUsuario(u); setAviso(''); setPantalla('panel'); };
  const alSalir = () => { setUsuario(null); setAviso(''); setPantalla('login'); };

  let contenido;
  if (pantalla === 'cargando') {
    contenido = (
      <View style={estilos.centro}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  } else if (pantalla === 'sinRed') {
    contenido = (
      <View style={estilos.centro}>
        <Text style={estilos.titulo}>No se pudo conectar</Text>
        <Text style={estilos.texto}>Servidor: {API_URL}</Text>
        <Text style={estilos.ayuda}>
          Revisa que el backend esté corriendo, que el teléfono y la PC estén en la misma red Wi-Fi
          y que la IP de src/config.js sea la de tu PC.
        </Text>
        <TouchableOpacity style={estilos.boton} onPress={iniciar}>
          <Text style={estilos.botonTexto}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (pantalla === 'panel') {
    contenido = <PanelScreen usuario={usuario} onSalir={alSalir} />;
  } else {
    contenido = <LoginScreen aviso={aviso} onEntrar={alEntrar} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {contenido}
    </SafeAreaProvider>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f1f5f9' },
  titulo: { fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  texto: { fontSize: 14, color: '#475569', marginBottom: 12 },
  ayuda: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20 },
  boton: { backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10 },
  botonTexto: { color: '#fff', fontWeight: '700', fontSize: 15 }
});
