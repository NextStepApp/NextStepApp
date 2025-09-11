import React, { useEffect, useState } from "react";
import { Platform, TouchableOpacity, Text } from "react-native";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  if (Platform.OS !== "web" || !canInstall) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {}
    setDeferredPrompt(null);
    setCanInstall(false);
  };

  return (
    <TouchableOpacity
      onPress={handleInstall}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 8,
        marginRight: 8
      }}
    >
      <Text>Install App</Text>
    </TouchableOpacity>
  );
}
