<template>
  <div>
    <h1>リアルタイムピッチ検出と周波数特性</h1>
    <canvas ref="pitchCanvas" width="800" height="200"></canvas>
    <canvas ref="frequencyCanvas" width="800" height="300"></canvas>
    <p>現在のピッチ: {{ currentPitch }} Hz</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import init, { McLeodPitchDetector } from "../wasm/pitch_detection";

const currentPitch = ref<number | null>(null);
const pitchCanvas = ref<HTMLCanvasElement | null>(null);
const frequencyCanvas = ref<HTMLCanvasElement | null>(null);

onMounted(async () => {
  // WASMの初期化
  await init();

  // オーディオコンテキストとマイクストリームを設定
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioContext.createMediaStreamSource(stream);

  console.log("Audio Stream:", stream);

  // ピッチ検出器を初期化
  const bufferSize = 2048;
  const padding = bufferSize / 2;
  const sampleRate = audioContext.sampleRate;
  const powerThreshold = 0.001;
  const clarityThreshold = 0.7;
  const detector = new McLeodPitchDetector(bufferSize, padding);

  // AnalyserNodeの設定
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = bufferSize;
  analyser.minDecibels = -90;
  analyser.smoothingTimeConstant = 0.85;

  const audioBuffer = new Float32Array(bufferSize);
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  source.connect(analyser);

  // 振幅のエネルギー（RMS）計算関数
  const calculateRMS = (buffer: Float32Array): number => {
    const sumSquares = buffer.reduce((sum, value) => sum + value * value, 0);
    return Math.sqrt(sumSquares / buffer.length);
  };

  // ピッチ更新関数
  const updateVisualization = () => {
    analyser.getFloatTimeDomainData(audioBuffer);
    analyser.getByteFrequencyData(frequencyData);

    // 振幅（エネルギー）の計算
    const amplitude = calculateRMS(audioBuffer);
    console.log("Amplitude:", amplitude);

    if (amplitude < powerThreshold) {
      console.log("Amplitude too low for pitch detection");
      currentPitch.value = null;
      drawPitchIndicator(0);
    } else {
      // ピッチ検出
      const pitch = detector.detect_pitch(audioBuffer, sampleRate, powerThreshold, clarityThreshold);
      console.log("Detected pitch:", pitch);
      currentPitch.value = pitch || 0;
      drawPitchIndicator(pitch || 0);
    }

    // 周波数特性を描画
    drawFrequencySpectrum();

    // 次のフレームをリクエスト
    requestAnimationFrame(updateVisualization);
  };

  // ピッチインジケーターを描画
  const drawPitchIndicator = (pitch: number) => {
    const ctx = pitchCanvas.value?.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 800, 200);
      ctx.fillStyle = "blue";
      const x = (pitch / 2000) * 800; // ピッチをスケールにマッピング
      ctx.fillRect(x, 100, 10, 50);

      // 目盛りを描画
      ctx.fillStyle = "black";
      ctx.font = "14px Arial";
      for (let i = 0; i <= 2000; i += 200) {
        const tickX = (i / 2000) * 800;
        ctx.fillText(`${i} Hz`, tickX, 180);
        ctx.beginPath();
        ctx.moveTo(tickX, 100);
        ctx.lineTo(tickX, 150);
        ctx.strokeStyle = "gray";
        ctx.stroke();
      }
    }
  };

  // 周波数特性を描画
  const drawFrequencySpectrum = () => {
    const ctx = frequencyCanvas.value?.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 800, 300);

      // 目盛りを描画
      ctx.fillStyle = "black";
      ctx.font = "14px Arial";
      for (let i = 0; i <= 8000; i += 1000) {
        const x = (i / 8000) * 800;
        ctx.fillText(`${i} Hz`, x, 290);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 300);
        ctx.strokeStyle = "lightgray";
        ctx.stroke();
      }

      ctx.fillStyle = "green";
      const barWidth = 800 / frequencyData.length;

      frequencyData.forEach((value, index) => {
        const barHeight = (value / 255) * 250; // 正規化して高さを計算
        ctx.fillRect(index * barWidth, 300 - barHeight, barWidth - 1, barHeight);
      });
    }
  };

  // ピッチ検出を開始
  updateVisualization();
});
</script>

<style>
canvas {
  border: 1px solid black;
  margin-bottom: 20px;
}
</style>


<!-- <template>
  <div>
    <h1>リアルタイムピッチ検出</h1>
    <canvas ref="canvas" width="600" height="150"></canvas>
    <p>現在のピッチ: {{ currentPitch }} Hz</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import init, { McLeodPitchDetector } from "../wasm/pitch_detection";

const currentPitch = ref<number | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

onMounted(async () => {
  // WASMの初期化
  await init();

  // オーディオコンテキストとマイクストリームを設定
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioContext.createMediaStreamSource(stream);

  console.log("Audio Stream:", stream);

  // ピッチ検出器を初期化
  const bufferSize = 2048;
  const padding = bufferSize / 2;
  const sampleRate = audioContext.sampleRate;
  const powerThreshold = 0.001; // 閾値を調整（デフォルトを小さめに設定）
  const clarityThreshold = 0.7;
  const detector = new McLeodPitchDetector(bufferSize, padding);

  // AnalyserNode の設定
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = bufferSize;
  const audioBuffer = new Float32Array(bufferSize);
  source.connect(analyser);

  // 振幅のエネルギー（RMS）計算関数
  const calculateRMS = (buffer: Float32Array): number => {
    const sumSquares = buffer.reduce((sum, value) => sum + value * value, 0);
    return Math.sqrt(sumSquares / buffer.length);
  };

  // ピッチ更新関数
  const updatePitch = () => {
    analyser.getFloatTimeDomainData(audioBuffer);

    // 振幅（エネルギー）の計算
    const amplitude = calculateRMS(audioBuffer);
    console.log("Amplitude:", amplitude);

    if (amplitude < powerThreshold) {
      console.log("Amplitude too low for pitch detection");
      currentPitch.value = null;
      drawPitchIndicator(0);
    } else {
      // ピッチ検出
      const pitch = detector.detect_pitch(audioBuffer, sampleRate, powerThreshold, clarityThreshold);
      console.log("Detected pitch:", pitch);
      currentPitch.value = pitch || 0;
      drawPitchIndicator(pitch || 0);
    }

    // 次のフレームをリクエスト
    requestAnimationFrame(updatePitch);
  };

  // ピッチインジケーターを描画
  const drawPitchIndicator = (pitch: number) => {
    const ctx = canvas.value?.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 600, 150);
      ctx.fillStyle = "blue";
      const x = (pitch / 2000) * 600; // ピッチをスケールにマッピング
      ctx.fillRect(x, 50, 10, 50);
    }
  };

  // ピッチ検出を開始
  updatePitch();
});
</script>

<style>
canvas {
  border: 1px solid black;
}
</style> -->
