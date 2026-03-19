import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BleManager } from "react-native-ble-plx";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const manager = new BleManager();

export default function Index() {
  const webRef = useRef<WebView>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [showList, setShowList] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<any>(null);
  const [status, setStatus] = useState<string>("Idle");

  const requestPermissions = async () => {
    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        console.log("[BLE] Permissions:", granted);

        if (
          granted["android.permission.BLUETOOTH_SCAN"] !== "granted" ||
          granted["android.permission.BLUETOOTH_CONNECT"] !== "granted" ||
          granted["android.permission.ACCESS_FINE_LOCATION"] !== "granted"
        ) {
          Alert.alert(
            "Permission required",
            "Bluetooth permissions are required to scan devices.",
          );
          return false;
        }
        return true;
      } catch (err) {
        console.error("[BLE] Permission error:", err);
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    requestPermissions();

    return () => {
      manager.stopDeviceScan();
      if (connectedDevice) {
        connectedDevice.cancelConnection();
      }
    };
  }, [connectedDevice]);

  const startBluetoothProcess = async () => {
    setStatus("Checking Bluetooth...");
    const state = await manager.state();
    console.log("[BLE] Current state:", state);

    if (state !== "PoweredOn") {
      console.log("[BLE] Bluetooth is not powered on. Waiting...");
      setStatus("Bluetooth off - turning on...");
      const subscription = manager.onStateChange((newState) => {
        console.log("[BLE] State changed to:", newState);
        if (newState === "PoweredOn") {
          subscription?.remove();
          scanDevices();
        }
      }, true);

      return;
    }

    scanDevices();
  };

  const sendToWeb = (payload: any) => {
    let jsCode = "";

    if (payload.status === "SCANNING") {
      jsCode = `
      const el = document.querySelector('.printer-state-text');
      if(el){ el.innerText = "Scanning..."; el.style.color="orange"; }
      true;
    `;
    }

    if (payload.status === "CONNECTED") {
      jsCode = `
      const el = document.querySelector('.printer-state-text');
      if(el){ el.innerText = "Connected ✅"; el.style.color="green"; }
      true;
    `;
    }

    if (payload.status === "FAILED") {
      jsCode = `
      const el = document.querySelector('.printer-state-text');
      if(el){ el.innerText = "Connection Failed"; el.style.color="red"; }
      true;
    `;
    }

    if (payload.status === "WEIGHT") {
      jsCode = `
      const weightEl = document.querySelector("#weight");
      if(weightEl){
        weightEl.innerText = "${payload.value}";
      }
      true;
    `;
    }

    webRef.current?.injectJavaScript(jsCode);
  };

  const scanDevices = async () => {
    console.log("[BLE] Starting device scan...");
    setDevices([]);
    setShowList(true);
    setStatus("Scanning...");

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error("[BLE] Scan Error:", error);
        setStatus("Scan failed: " + error.message);
        return;
      }

      if (!device) return;

      console.log(
        "[BLE] Device Found:",
        device?.name || device?.localName || "Unknown",
        "ID:",
        device?.id,
      );

      setDevices((prevDevices) => {
        const exists = prevDevices.find((d) => d.id === device.id);
        if (exists) return prevDevices;
        return [...prevDevices, device];
      });
    });

    // Stop scanning after 15 seconds
    setTimeout(() => {
      manager.stopDeviceScan();
      console.log("[BLE] Scan stopped");
      setStatus("Scan complete");
    }, 15000);
  };

  const connectDevice = async (device: any) => {
    try {
      console.log("[BLE] Connecting to device:", device.name || device.id);
      setStatus("Connecting...");
      manager.stopDeviceScan(); // Stop scanning first

      const connected = await device.connect();
      console.log("[BLE] Device connected:", device.name);

      await connected.discoverAllServicesAndCharacteristics();
      console.log("[BLE] Services discovered");

      setConnectedDevice(connected);
      sendToWeb({ status: "CONNECTED", device: device.name || device.id });
      setStatus("✅ Connected - " + (device.name || device.id));
      setShowList(false);

      // Start listening to weight data
      await listenWeight(connected);
    } catch (err) {
      console.error("[BLE] Connection error:", err);
      setStatus("❌ Connection failed");
    }
  };

  // Listen weight
  const listenWeight = async (device: any) => {
    try {
      console.log("[BLE] Starting to listen for weight data...");
      const services = await device.services();
      console.log("[BLE] Found", services.length, "services");

      let foundCharacteristic = false;

      for (const service of services) {
        console.log("[BLE] Service UUID:", service.uuid);
        const characteristics = await service.characteristics();
        console.log(
          "[BLE] Service has",
          characteristics.length,
          "characteristics",
        );

        for (const char of characteristics) {
          console.log(
            "[BLE] Characteristic UUID:",
            char.uuid,
            "Props:",
            char.properties,
          );

          // Try to monitor all readable characteristics
          if (char.isReadable || char.isNotifiable || char.isIndicatable) {
            foundCharacteristic = true;
            console.log("[BLE] Monitoring characteristic:", char.uuid);

            char.monitor((error: any, characteristic: any) => {
              if (error) {
                console.error("[BLE] Monitor error:", error);
                return;
              }

              if (characteristic?.value) {
                try {
                  const weight = atob(characteristic.value);
                  console.log("[BLE] Weight received:", weight);

                  sendToWeb({
                    status: "WEIGHT",
                    value: weight,
                  });
                } catch (e) {
                  console.error("[BLE] Decode error:", e);
                }
              }
            });
          }
        }
      }

      if (!foundCharacteristic) {
        console.warn("[BLE] No readable characteristics found");
      }
    } catch (err) {
      console.error("[BLE] Listen weight error:", err);
    }
  };

  // Receive message from WebView
  const onMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "CONNECT_BLUETOOTH") {
        scanDevices();
      }
    } catch (e) {
      console.log(e);
    }
  };

  const injectedJS = `
(function() {

  console.log("Bridge Started");

  const interval = setInterval(() => {

    const buttons = document.querySelectorAll("button");

    buttons.forEach(btn => {

      if(btn.innerText.trim().toUpperCase() === "CONNECT"){

        if(!btn.dataset.bridge){

          btn.dataset.bridge="true";

          btn.style.border="2px solid green";

          btn.addEventListener("click",function(e){

            e.preventDefault();
            e.stopPropagation();

            window.ReactNativeWebView.postMessage(
              JSON.stringify({ type:"CONNECT_BLUETOOTH" })
            );

          });

        }

      }

    });

  },1000);

})();
true;
`;

  return (
    <SafeAreaView style={styles.container}>
      {/* Status Bar */}
      <View
        style={{
          backgroundColor: "#f0f0f0",
          padding: 10,
          borderBottomWidth: 1,
        }}
      >
        <Text style={{ fontSize: 12, color: "#666" }}>
          Status: {status} | Devices: {devices.length}
        </Text>
        {connectedDevice && (
          <Text style={{ fontSize: 12, color: "green", marginTop: 5 }}>
            ✓ Device Connected
          </Text>
        )}
      </View>

      <WebView
        ref={webRef}
        source={{
          uri: "https://weighingmachine.netlify.app/login.html",
        }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScript={injectedJS}
        onMessage={onMessage}
      />
      {/* {showList && (
        <SafeAreaView
          style={{
            position: "absolute",
            bottom: 0,
            backgroundColor: "white",
            width: "100%",
            maxHeight: 400,
          }}
        >
          <View
            style={{
              position: "absolute",
              bottom: 0,
              backgroundColor: "white",
              width: "100%",
              maxHeight: 400,
              paddingBottom: 30,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "bold", padding: 10 }}>
              Select Device ({devices.length})
            </Text>

            {devices.length === 0 ? (
              <Text style={{ padding: 15, color: "#999" }}>
                Scanning... Make sure your device is powered on and in range.
              </Text>
            ) : (
              <FlatList
                data={devices}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => connectDevice(item)}
                    style={{
                      padding: 15,
                      borderBottomWidth: 1,
                      borderColor: "#ddd",
                    }}
                  >
                    <Text style={{ fontWeight: "bold" }}>
                      {item.name || item.localName || "Unknown Device"}
                    </Text>
                    <Text style={{ color: "gray", fontSize: 12 }}>
                      {item.id}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      )} */}
      {showList && (
        <SafeAreaView
          style={{
            position: "absolute",
            bottom: 0,
            backgroundColor: "white",
            width: "100%",
            height: "60%",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "white",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
          >
            <View
              style={{ padding: 10, borderBottomWidth: 1, borderColor: "#ddd" }}
            >
              <Text style={{ fontSize: 18, fontWeight: "bold" }}>
                Select Device ({devices.length})
              </Text>
            </View>

            {devices.length === 0 ? (
              <View
                style={{
                  padding: 15,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#999" }}>
                  Scanning... Make sure your device is powered on and in range.
                </Text>
              </View>
            ) : (
              <FlatList
                data={devices}
                keyExtractor={(item) => item.id}
                scrollEnabled={true}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => connectDevice(item)}
                    style={{
                      padding: 15,
                      borderBottomWidth: 1,
                      borderColor: "#eee",
                    }}
                  >
                    <Text style={{ fontWeight: "bold", fontSize: 16 }}>
                      {item.name || item.localName || "Unknown Device"}
                    </Text>
                    <Text style={{ color: "gray", fontSize: 12, marginTop: 4 }}>
                      {item.id}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
