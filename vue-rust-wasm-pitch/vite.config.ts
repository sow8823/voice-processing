import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'esnext', // モダンブラウザ用
    rollupOptions: {
      // AudioWorkletのファイルを個別にビルド
      input: {
        main: resolve(__dirname, 'index.html'),
        'frequency-analyzer-processor': resolve(__dirname, 'src/worklets/frequency-analyzer-processor.js'),
      },
      output: {
        // AudioWorkletのファイルを別々のチャンクとして出力
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === 'frequency-analyzer-processor'
            ? 'assets/worklets/[name].js'
            : 'assets/[name]-[hash].js';
        },
      },
    },
  },
  server: {
    headers: {
      // AudioWorkletの読み込みに必要なCORSヘッダーを設定
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
