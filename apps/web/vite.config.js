import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import frontendConfig from '../../scripts/frontend-config.js';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: frontendConfig.frontendPort,
    strictPort: true,
    // Proxy /api during development so the browser sees one origin and the
    // httpOnly refresh cookie works without any CORS configuration.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  // Tests run in the same config as the build, so a component that compiles
  // for production is the one being asserted against.
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.jsx', 'src/**/*.test.js'],
    globals: true,
  },

  // The workspace contract is CommonJS while the web app is ESM. Prebundle it
  // for the dev server too; otherwise direct browser loads see no default
  // export even though Vitest and the production Rollup build interop it.
  optimizeDeps: {
    include: [
      '@hisabkikitab/contracts/catalogue',
      '@hisabkikitab/contracts/validation',
    ],
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    /*
     * @hisabkikitab/contracts is CommonJS, because the API requires it. It is
     * also a workspace package, so it resolves to a path inside the repo rather
     * than into node_modules - and Rollup only applies its CommonJS interop to
     * node_modules by default. Without this, `vite build` fails on the shared
     * validation module with "default is not exported", while vitest and the
     * dev server both handle it. Naming the package here is what keeps one
     * implementation of the name, email and password rules instead of two.
     */
    commonjsOptions: {
      include: [/packages[\/]contracts/, /node_modules/],
    },
    rollupOptions: {
      output: {
        // Split the two heaviest libraries out of the main bundle.
        manualChunks: {
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
