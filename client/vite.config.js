import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /auth and /api to the Express server during development
    // so we don't have to deal with CORS issues when running locally
    proxy: {
      '/auth': 'http://localhost:5000',
      '/api':  'http://localhost:5000',
    },
  },
});
