import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    // Strictly disable source maps so no original .ts / .tsx files or folder structure appear in DevTools Sources tab
    sourcemap: false,
    minify: 'esbuild',
    cssMinify: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  esbuild: {
    // Removes all console.log and debugger statements from the production client bundle
    drop: ['console', 'debugger'],
    legalComments: 'none',
  },
});
