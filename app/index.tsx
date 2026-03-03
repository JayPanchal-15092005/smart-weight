import React, { useEffect, useRef } from "react";
import {
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { BleManager } from "react-native-ble-plx";
import { WebView } from "react-native-webview";

const manager = new BleManager();

export default function Index() {
  const webViewRef = useRef<WebView>(null);

  // 1. JavaScript to Inject into the client's website
  const injectJS = `
    (function() {
      // Find the Connect button (based on your screenshot class)
      const connectBtn = document.querySelector('.connect-button') || document.querySelector('button[type="button"]');
      
      if (connectBtn) {
        // Remove existing listeners and add our bridge
        connectBtn.onclick = function(e) {
          e.preventDefault();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'CONNECT_BLUETOOTH'
          }));
        };
      }

      // Create the listener for status updates from Expo
      window.onBluetoothUpdate = function(payload) {
        const statusLabel = document.querySelector('.printer-state-text');
        if (statusLabel) {
          if (payload.data === 'SCANNING') statusLabel.innerText = "Scanning scale...";
          if (payload.data === 'CONNECTED') statusLabel.innerText = "Connected ✅";
          if (payload.data === 'DISCONNECTED') statusLabel.innerText = "Disconnected";
        }
      };
    })();
    true;
  `;

  const requestPermissions = async () => {
    if (Platform.OS === "android") {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    }
  };

  useEffect(() => {
    requestPermissions();
  }, []);

  const startBluetoothProcess = async () => {
    const btState = await manager.state();
    if (btState !== "PoweredOn") {
      Alert.alert("Bluetooth Off", "Please turn on Bluetooth.");
      return;
    }

    // Send status back to injected JS
    sendToWeb({ type: "STATUS", data: "SCANNING" });

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) return;

      if (device?.name?.toLowerCase().includes("weigh")) {
        manager.stopDeviceScan();
        device
          .connect()
          .then((d) => d.discoverAllServicesAndCharacteristics())
          .then(() => {
            sendToWeb({ type: "STATUS", data: "CONNECTED" });
          })
          .catch(() => {
            sendToWeb({ type: "STATUS", data: "DISCONNECTED" });
          });
      }
    });
  };

  const sendToWeb = (payload: object) => {
    const jsCode = `window.onBluetoothUpdate(${JSON.stringify(payload)}); true;`;
    webViewRef.current?.injectJavaScript(jsCode);
  };

  const onMessage = (event: any) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.action === "CONNECT_BLUETOOTH") {
      startBluetoothProcess();
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: "https://weighingmachine.netlify.app/login.html" }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        // This injects the code EVERY time a new page loads
        onLoadEnd={() => {
          webViewRef.current?.injectJavaScript(injectJS);
        }}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
});
