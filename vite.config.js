import { defineConfig } from 'vite';

// three.js + GSAP num pacote só (~210 kB com gzip): o aviso padrão de 500 kB não ajuda aqui
export default defineConfig({
  build: { chunkSizeWarningLimit: 900 },
});
