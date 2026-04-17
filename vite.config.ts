import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({mode}) => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.ENABLE_HMR === 'true',
      allowedHosts: true,
      host: '0.0.0.0',
      watch: {
        ignored: ['**/.local/**', '**/node_modules/**'],
      },
    },
  };
});
