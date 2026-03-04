// import React, { useEffect, useRef } from "react";
// import {
//   Alert,
//   PermissionsAndroid,
//   Platform,
//   StyleSheet
// } from "react-native";
// import { BleManager } from "react-native-ble-plx";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { WebView } from "react-native-webview";

// const manager = new BleManager();

// export default function Index() {
//   const webViewRef = useRef<WebView>(null);

//   // This script keeps searching for the button until it finds it
//   const injectJS = `
//     (function() {
//       console.log("Bridge Script Initialized");

//       const checkInterval = setInterval(() => {
//         const buttons = Array.from(document.querySelectorAll('button'));
//         const connectBtn = buttons.find(btn => btn.innerText.trim().toUpperCase() === 'CONNECT');

//         if (connectBtn && !connectBtn.getAttribute('data-bridge-active')) {
//           console.log("Connect Button Found!");
//           connectBtn.setAttribute('data-bridge-active', 'true');

//           // Force our logic onto the button
//           connectBtn.onclick = function(e) {
//             e.preventDefault();
//             e.stopPropagation();
//             window.ReactNativeWebView.postMessage(JSON.stringify({ action: 'CONNECT_BLUETOOTH' }));
//           };

//           // Optional: Visual feedback so you know it worked
//           connectBtn.style.border = "2px solid green";
//         }
//       }, 1000); // Check every 1 second

//       window.onBluetoothUpdate = function(payload) {
//         const statusLabel = document.querySelector('.printer-state-text');
//         if (statusLabel) {
//            statusLabel.innerText = payload.data;
//            statusLabel.style.color = payload.data.includes('✅') ? 'green' : 'orange';
//         }
//       };
//     })();
//     true;
//   `;

//   const requestPermissions = async () => {
//     if (Platform.OS === "android") {
//       await PermissionsAndroid.requestMultiple([
//         PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
//         PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
//         PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
//       ]);
//     }
//   };

//   useEffect(() => {
//     requestPermissions();
//   }, []);

//   const startBluetoothProcess = async () => {
//     const btState = await manager.state();
//     if (btState !== "PoweredOn") {
//       Alert.alert("Bluetooth Off", "Please turn on Bluetooth.");
//       return;
//     }

//     sendToWeb({ type: "STATUS", data: "SCANNING..." });

//     manager.startDeviceScan(null, null, (error, device) => {
//       if (error) {
//         console.log("Scan Error:", error);
//         return;
//       }

//       // Check for your specific weighing machine name
//       if (
//         device?.name?.toLowerCase().includes("weigh") ||
//         device?.name?.includes("SMART")
//       ) {
//         manager.stopDeviceScan();
//         device
//           .connect()
//           .then((d) => d.discoverAllServicesAndCharacteristics())
//           .then(() => {
//             sendToWeb({ type: "STATUS", data: "CONNECTED ✅" });
//             Alert.alert("Success", "Connected to " + device.name);
//           })
//           .catch((err) => {
//             console.log("Conn Error:", err);
//             sendToWeb({ type: "STATUS", data: "FAILED" });
//           });
//       }
//     });
//   };

//   const sendToWeb = (payload: object) => {
//     const jsCode = `if(window.onBluetoothUpdate) window.onBluetoothUpdate(${JSON.stringify(payload)}); true;`;
//     webViewRef.current?.injectJavaScript(jsCode);
//   };

//   const onMessage = (event: any) => {
//     try {
//       const data = JSON.parse(event.nativeEvent.data);
//       if (data.action === "CONNECT_BLUETOOTH") {
//         startBluetoothProcess();
//       }
//     } catch (e) {
//       console.log("Message Error:", e);
//     }
//   };

//   return (
//     <SafeAreaView style={styles.container}>
//       <WebView
//         ref={webViewRef}
//         source={{ uri: "https://weighingmachine.netlify.app/login.html" }}
//         style={styles.webview}
//         javaScriptEnabled={true}
//         domStorageEnabled={true}
//         onLoadEnd={() => {
//           webViewRef.current?.injectJavaScript(injectJS);
//         }}
//         onMessage={onMessage}
//       />
//     </SafeAreaView>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: "#fff",
//   },
//   webview: {
//     flex: 1,
//     marginTop: Platform.OS === "android" ? 0 : 0, // Adjusted by SafeAreaView
//   },
// });

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

  let connectedDevice: any = null;

  // const requestPermissions = async () => {
  //   if (Platform.OS === "android") {
  //     await PermissionsAndroid.requestMultiple([
  //       PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  //       PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  //       PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  //     ]);
  //   }
  // };

  const requestPermissions = async () => {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      console.log("Permissions:", granted);

      if (
        granted["android.permission.BLUETOOTH_SCAN"] !== "granted" ||
        granted["android.permission.BLUETOOTH_CONNECT"] !== "granted" ||
        granted["android.permission.ACCESS_FINE_LOCATION"] !== "granted"
      ) {
        Alert.alert(
          "Permission required",
          "Bluetooth permissions are required.",
        );
      }
    }
  };

  useEffect(() => {
    requestPermissions();
  }, []);

  const startBluetoothProcess = async () => {
    const state = await manager.state();

    if (state !== "PoweredOn") {
      manager.onStateChange((newState) => {
        if (newState === "PoweredOn") {
          scanDevices();
        }
      }, true);

      return;
    }

    scanDevices();
  };

  // Send message to WebView
  // const sendToWeb = (data: any) => {
  //   const js = `
  //     window.onBluetoothUpdate && window.onBluetoothUpdate(${JSON.stringify(
  //       data
  //     )});
  //     true;
  //   `;
  //   webRef.current?.injectJavaScript(js);
  // };

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

  // Scan Bluetooth
  // const scanDevices = async () => {
  //   const state = await manager.state();

  //   if (state !== "PoweredOn") {
  //     Alert.alert("Bluetooth is OFF");
  //     return;
  //   }

  //   sendToWeb({ status: "SCANNING..." });

  //   manager.startDeviceScan(null, null, (error, device) => {
  //     if (error) {
  //       console.log(error);
  //       return;
  //     }

  //     if (device?.name) {
  //       console.log("Device:", device.name);

  //       if (
  //         device.name.toLowerCase().includes("weigh") ||
  //         device.name.toLowerCase().includes("scale")
  //       ) {
  //         manager.stopDeviceScan();
  //         connectDevice(device);
  //       }
  //     }
  //   });
  // };  // please use this function if the error is come in the scaning the bluebooth OK.

  const scanDevices = async () => {
    setDevices([]); // clear previous devices
    setShowList(true);

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log("Scan Error:", error);
        return;
      }

      console.log(
        "Device Found:",
        device?.name || device?.localName || "Unknown",
        device?.id,
      );

      if (!device) return;

      setDevices((prevDevices) => {
        // avoid duplicate devices
        const exists = prevDevices.find((d) => d.id === device.id);
        if (exists) return prevDevices;

        return [...prevDevices, device];
      });
    });

    // stop scanning after 10 seconds
    setTimeout(() => {
      manager.stopDeviceScan();
      console.log("Scan stopped");
    }, 10000);
    console.log("Device: ", devices);
  };

  // Connect device
  // const connectDevice = async (device: any) => {
  //   try {
  //     const connected = await device.connect();
  //     await connected.discoverAllServicesAndCharacteristics();

  //     connectedDevice = connected;

  //     sendToWeb({
  //       status: "CONNECTED",
  //       device: connected.name,
  //     });

  //     Alert.alert("Connected", connected.name);

  //     listenWeight(connected);
  //   } catch (e) {
  //     console.log("Connection error", e);
  //     sendToWeb({ status: "FAILED" });
  //   }
  // }; please use this function if the error is come in the scaning the bluebooth OK

  const connectDevice = async (device: any) => {
    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();

      Alert.alert("Connected", device.name);

      setShowList(false);
    } catch (err) {
      console.log(err);
    }
  };

  // Listen weight
  const listenWeight = async (device: any) => {
    const services = await device.services();

    for (const service of services) {
      const characteristics = await service.characteristics();

      for (const char of characteristics) {
        char.monitor((error: any, characteristic: any) => {
          if (error) {
            console.log(error);
            return;
          }

          if (characteristic?.value) {
            const weight = atob(characteristic.value);

            console.log("Weight:", weight);

            sendToWeb({
              status: "WEIGHT",
              value: weight,
            });
          }
        });
      }
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

  // Inject script to website
  // const injectedJS = `
  // (function(){

  //   console.log("Bridge Ready");

  //   const interval = setInterval(()=>{

  //     const btns = document.querySelectorAll("button");

  //     btns.forEach(btn=>{

  //       if(btn.innerText.trim().toUpperCase() === "CONNECT"){

  //         btn.style.border="2px solid green";

  //         btn.onclick = function(e){

  //           e.preventDefault();

  //           window.ReactNativeWebView.postMessage(
  //             JSON.stringify({type:"CONNECT_BLUETOOTH"})
  //           );

  //         }

  //       }

  //     });

  //   },1000);

  //   window.onBluetoothUpdate = function(data){

  //     console.log("Bluetooth Update",data);

  //     const status = document.querySelector(".printer-state-text");

  //     if(status){

  //       status.innerText = data.status;

  //     }

  //     if(data.status==="WEIGHT"){

  //       const weightBox = document.querySelector("#weight");

  //       if(weightBox){
  //         weightBox.innerText = data.value;
  //       }

  //     }

  //   }

  // })();
  // true;
  // `;

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
      {showList && (
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
              Select Device
            </Text>

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
                  <Text style={{ color: "gray", fontSize: 12 }}>{item.id}</Text>
                </TouchableOpacity>
              )}
            />
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
