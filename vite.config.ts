import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';

function deviceDebugPlugin(): Plugin {
  const logFile = resolve(fileURLToPath(new URL('./.tmp/device-debug.jsonl', import.meta.url)));
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] !== '/__debug-log' || req.method !== 'POST') {
      next();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      mkdirSync(resolve(fileURLToPath(new URL('./.tmp', import.meta.url))), { recursive: true });
      const line = Buffer.concat(chunks).toString('utf8').trim() || '{}';
      appendFileSync(logFile, `${line}\n`);
      res.statusCode = 204;
      res.end();
    });
  };
  return {
    name: 'device-debug-log',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

const iosLanHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
};

export default defineConfig({
  plugins: [
    react(),
    deviceDebugPlugin(),
    {
      name: 'ios-html-compat',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin(?:="[^"]*")?/g, '');
      },
      closeBundle() {
        const dist = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
        const indexPath = resolve(dist, 'index.html');
        const cssPath = resolve(dist, 'assets/app.css');
        if (!existsSync(indexPath) || !existsSync(cssPath)) return;
        const css = readFileSync(cssPath, 'utf8');
        let html = readFileSync(indexPath, 'utf8');
        html = html.replace(/<link rel="stylesheet" href="[^"]+"\s*\/?>/, `<style>${css}</style>`);
        writeFileSync(indexPath, html);
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (info) =>
          info.name?.endsWith('.css') ? 'assets/app.css' : 'assets/[name][extname]',
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    headers: iosLanHeaders,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
    cors: true,
    headers: iosLanHeaders,
  },
});
