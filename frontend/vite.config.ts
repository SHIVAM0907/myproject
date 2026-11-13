import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Lets the browser call /api on the dev origin while VITE_API_BASE_URL
      // points at the real backend, avoiding CORS during development.
      "/api": {
        target: process.env.VITE_API_BASE_URL || "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },
});