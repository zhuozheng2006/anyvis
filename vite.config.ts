import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'ANYVIS_');
  return {
    plugins: [react()],
    server: {
      port: Number(env.ANYVIS_UI_PORT || 5174),
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${env.ANYVIS_PORT || 4317}`, changeOrigin: false } },
    },
  };
});
