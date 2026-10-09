import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "ByggLogg – N L Austnes",
        short_name: "ByggLogg",
        description: "Ferieoversikt, feriekalender og søknader for N L Austnes AS",
        lang: "nb",
        theme_color: "#1E5A4A",
        background_color: "#EEF0EC",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: { navigateFallbackDenylist: [/^\/auth/], skipWaiting: true, clientsClaim: true, cleanupOutdatedCaches: true }
    })
  ],
  test: { environment: "node", include: ["test/**/*.test.ts"] }
} as any);
