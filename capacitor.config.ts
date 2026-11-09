import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.quetablero.app",
  appName: "El tablero",
  webDir: "out",
  bundledWebRuntime: false,
  ios: {
    contentInset: "automatic",
    allowsLinkPreview: false,
    scrollEnabled: true,
    backgroundColor: "#f6f6f4",
    preferredContentMode: "mobile",
  },
  server: {
    // Para desarrollo en vivo en tu iPhone o simulador podés descomentar la URL de Vercel:
    // url: "https://webpage-poyosama.vercel.app",
    // cleartext: true,
    androidScheme: "https",
    iosScheme: "capacitor",
  },
};

export default config;
