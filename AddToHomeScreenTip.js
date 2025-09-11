import React, { useEffect, useState } from "react";
import { Platform, View, Text, TouchableOpacity } from "react-native";

const LS_KEY = "nextstepapp_a2hs_tip_dismissed";

function isIOSSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  if (window.navigator && typeof window.navigator.standalone !== "undefined") {
    return window.navigator.standalone === true;
  }
  if (window.matchMedia) {
    try {
      return window.matchMedia("(display-mode: standalone)").matches;
    } catch {}
  }
  return false;
}

export default function AddToHomeScreenTip() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!isIOSSafari()) return;
    if (isStandalone()) return;
    try {
      const dismissed = localStorage.getItem(LS_KEY) === "1";
      if (!dismissed) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  if (Platform.OS !== "web" || !show) return null;

  return (
    <View
      style={{
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        marginTop: 10,
        backgroundColor: "#fff",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3
      }}
    >
      <Text style={{ fontWeight: "700", marginBottom: 6 }}>Add to Home Screen</Text>
      <Text style={{ marginBottom: 8 }}>
        On iPhone/iPad (Safari): tap the <Text style={{ fontWeight: "700" }}>Share</Text> icon
        (square with ↑), then choose <Text style={{ fontWeight: "700" }}>Add to Home Screen</Text>.
      </Text>
      <View style={{ flexDirection: "row" }}>
        <TouchableOpacity
          onPress={() => {
            try { localStorage.setItem(LS_KEY, "1"); } catch {}
            setShow(false);
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 8 }}
        >
          <Text>Got it</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
