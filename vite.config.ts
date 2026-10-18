import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // Relative URLs support both a GitHub Pages project directory and a domain root.
  base: './',
  server: { port: 5173, strictPort: true },
});
