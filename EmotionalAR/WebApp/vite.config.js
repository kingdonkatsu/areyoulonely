import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
    optimizeDeps: {
        exclude: ['3d-tiles-renderer'],
    },
    server: {
        port: 3000,
        host: true,
    },
});
