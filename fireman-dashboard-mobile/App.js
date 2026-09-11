import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  TextInput,
  StatusBar,
  Alert,
  Platform
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Default endpoints
const DEFAULT_URL = 'http://100.120.34.14:3005'; // Tailscale NodeR
const LAN_URL = 'http://192.168.0.200:3005';     // Local LAN NodeR

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_URL);
  const [inputUrl, setInputUrl] = useState(DEFAULT_URL);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [keyReload, setKeyReload] = useState(1);

  const webViewRef = useRef(null);

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setHasBiometrics(compatible && enrolled);

      if (compatible && enrolled) {
        authenticate();
      } else {
        // If device has no biometrics configured, allow entry directly
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.log('Biometrics check error:', error);
      setIsAuthenticated(true);
    }
  };

  const authenticate = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autenticación Requerida - Fireman SOC',
        fallbackLabel: 'Usar credenciales del sistema',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsAuthenticated(true);
      } else {
        Alert.alert('Acceso Denegado', 'Se requiere autenticación para acceder al Fireman Dashboard.');
      }
    } catch (e) {
      console.log('Auth error:', e);
      setIsAuthenticated(true);
    }
  };

  const handleRefresh = () => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    } else {
      setKeyReload(prev => prev + 1);
    }
  };

  const handleSaveUrl = () => {
    setServerUrl(inputUrl);
    setIsSettingsOpen(false);
    setKeyReload(prev => prev + 1);
  };

  // Lock Screen (Biometrics)
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#060911" />
        <View style={styles.authContent}>
          <View style={styles.authIconCircle}>
            <Ionicons name="shield-checkmark" size={64} color="#00f2fe" />
          </View>
          <Text style={styles.authTitle}>Fireman SOC</Text>
          <Text style={styles.authSubtitle}>Autenticación biométrica requerida</Text>

          <TouchableOpacity style={styles.authButton} onPress={authenticate}>
            <Ionicons name="finger-print" size={24} color="#060911" style={{ marginRight: 10 }} />
            <Text style={styles.authButtonText}>Desbloquear con Biometría</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#060911" />

      {/* Top Mobile Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Ionicons name="flash" size={18} color="#00f2fe" />
          <Text style={styles.topBarTitle}>NodeR · Fireman</Text>
          <View style={styles.statusDot} />
        </View>

        <View style={styles.topBarRight}>
          <TouchableOpacity onPress={handleRefresh} style={styles.iconButton}>
            <Ionicons name="reload" size={19} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsSettingsOpen(true)} style={styles.iconButton}>
            <Ionicons name="settings-outline" size={19} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* WebView Container */}
      <View style={styles.webViewContainer}>
        <WebView
          key={keyReload}
          ref={webViewRef}
          source={{ uri: serverUrl }}
          style={styles.webView}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          pullToRefreshEnabled={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          allowsBackForwardNavigationGestures={true}
          renderLoading={() => (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#00f2fe" />
              <Text style={styles.loaderText}>Conectando con NodeR...</Text>
            </View>
          )}
        />
      </View>

      {/* Settings Modal */}
      <Modal visible={isSettingsOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configuración del Servidor</Text>
            <Text style={styles.modalDesc}>URL del Dashboard de Homepage:</Text>

            <TextInput
              style={styles.input}
              value={inputUrl}
              onChangeText={setInputUrl}
              placeholder="http://100.120.34.14:3005"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
            />

            <View style={styles.presetButtons}>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => setInputUrl(DEFAULT_URL)}
              >
                <Text style={styles.presetText}>Tailscale IP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => setInputUrl(LAN_URL)}
              >
                <Text style={styles.presetText}>LAN IP (200)</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnCancel]}
                onPress={() => setIsSettingsOpen(false)}
              >
                <Text style={styles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnSave]}
                onPress={handleSaveUrl}
              >
                <Text style={styles.btnSaveText}>Conectar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060911',
  },
  topBar: {
    height: 48,
    backgroundColor: '#060911',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#19263e',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
    marginLeft: 4,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    padding: 6,
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: '#060911',
  },
  webView: {
    flex: 1,
    backgroundColor: '#060911',
  },
  loaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#060911',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#060911',
    justifyContent: 'center',
    alignItems: 'center',
  },
  authContent: {
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  authIconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.25)',
    marginBottom: 8,
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
  },
  authSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 16,
  },
  authButton: {
    backgroundColor: '#00f2fe',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  authButtonText: {
    color: '#060911',
    fontSize: 15,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#19263e',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#060911',
    borderWidth: 1,
    borderColor: '#19263e',
    borderRadius: 8,
    color: '#ffffff',
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  presetButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  presetBtn: {
    backgroundColor: '#19263e',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  presetText: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  btnCancel: {
    backgroundColor: '#1e293b',
  },
  btnCancelText: {
    color: '#cbd5e1',
    fontWeight: '600',
  },
  btnSave: {
    backgroundColor: '#00f2fe',
  },
  btnSaveText: {
    color: '#060911',
    fontWeight: '700',
  },
});
