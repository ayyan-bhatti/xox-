/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The rules engine and the wire protocol live outside the client so the
      // server can import the exact same modules. The alias keeps that from
      // turning every import into ../../../shared/…
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Proxy the socket.io handshake to the realtime server in dev so the
    // client can use a same-origin URL and never needs CORS.
    proxy: {
      '/socket.io': {
        target: 'http://localhost:8787',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
