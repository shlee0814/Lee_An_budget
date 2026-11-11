import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { cpSync, copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

// The ledger remains classic scripts: their shared globals and execution order are intentional.
const staticFiles = ['app.js', 'photo.js', 'detail.js', 'budget.js', 'guide.js', 'dashboard-bridge.js', 'detail-layout.css', 'photo-upload.css', 'supabase-config.js', 'supabase-client.js', 'shared-ledger.js', 'favicon.svg', '.nojekyll'];
export default defineConfig({
  base: './',
  plugins: [tailwindcss(), {
    name: 'copy-ledger-runtime',
    closeBundle() {
      mkdirSync('dist', { recursive: true });
      renameSync('dist/source.html', 'dist/index.html');
      for (const file of staticFiles) copyFileSync(file, `dist/${file}`);
      cpSync('ocr', 'dist/ocr', { recursive: true });
    },
  }],
  build: { rollupOptions: { input: resolve(process.cwd(), 'source.html') } },
  resolve: { alias: { '@': resolve(process.cwd(), 'ui') } },
});
