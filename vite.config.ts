import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as {
  version?: string;
};

export default defineConfig(() => {
  const isSingleBundle = process.env.SINGLE_BUNDLE === '1';

  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version || '4.57.0'),
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: isSingleBundle
      ? undefined
      : {
          rollupOptions: {
            output: {
              manualChunks(id) {
                if (id.includes('node_modules/react') || id.includes('node_modules/lucide-react')) {
                  return 'vendor-ui';
                }
                if (id.includes('node_modules/leaflet')) {
                  return 'vendor-map';
                }
                if (id.includes('services/serviceRadarEngine')) {
                  return 'radar-data';
                }
              },
            },
          },
        },
  };
});
