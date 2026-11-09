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
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          // Keep shared helpers out of optional vendors: otherwise importing the
          // preload helper can eagerly pull Three.js and Math.js into Studio.
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            if (id.includes('api-registry.json')) return 'api-registry';
            if (id.includes('node_modules/blockly')) return 'vendor-blockly';
            if (id.includes('node_modules/@codemirror') || id.includes('node_modules/@uiw/react-codemirror') || id.includes('node_modules/@uiw/codemirror-') || id.includes('node_modules/@lezer')) return 'vendor-codemirror';
            if (id.includes('node_modules/mathjs') || id.includes('node_modules/complex.js') || id.includes('node_modules/decimal.js') || id.includes('node_modules/fraction.js')) return 'vendor-math';
            if (id.includes('node_modules/three') || id.includes('node_modules/@react-three')) return 'vendor-three';
            if (id.includes('node_modules/@xzdarcy') || id.includes('node_modules/react-virtualized')) return 'vendor-timeline';
            if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react';
          },
        },
      },
    },
  };
});
