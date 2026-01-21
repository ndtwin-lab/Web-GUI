import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  // Map NDT_API_BASE_URL to VITE_NDT_API_BASE_URL for client-side access
  // This allows users to use NDT_API_BASE_URL in .env, which is more intuitive
  const ndtApiBaseUrl = env.NDT_API_BASE_URL || env.VITE_NDT_API_BASE_URL;
  
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0', // Listen on all network interfaces
      port: 5173,
      // proxy: {
      //   '/ndt': {
      //     target: ndtApiBaseUrl,
      //     changeOrigin: true,
      //     secure: false,
      //     ws: true,
      //   },
      // }
    },
    define: {
      'process.env': {},
      // Map NDT_API_BASE_URL to VITE_NDT_API_BASE_URL for client-side code
      // This allows users to use NDT_API_BASE_URL in .env file
      'import.meta.env.VITE_NDT_API_BASE_URL': JSON.stringify(ndtApiBaseUrl),
    },
  };
});
