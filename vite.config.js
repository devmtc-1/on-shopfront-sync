// vite.config.js - 正确的格式
import { defineConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';

export default defineConfig({
  plugins: [reactRouter()],
  ssr: {
    noExternal: ['node-fetch'],
  },
});