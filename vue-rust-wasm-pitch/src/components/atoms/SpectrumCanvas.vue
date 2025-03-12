<template>
  <div>
    <canvas ref="spectrumCanvas" :width="canvasWidth" :height="canvasHeight"></canvas>
    <p>2倍音強度: {{ harmonic2Ratio.toFixed(2) }}%</p>
    <p>3倍音強度: {{ harmonic3Ratio.toFixed(2) }}%</p>
    <p>2.8kHz~3.2kHz 最大成分強度: {{ bandPeakRatio.toFixed(2) }}%</p>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, watchEffect, computed } from "vue";

// キャンバスサイズ
const canvasWidth = 800;
const canvasHeight = 300;

const props = defineProps<{ frequencyData: Uint8Array; baseFrequency: number }>();
const spectrumCanvas = ref<HTMLCanvasElement | null>(null);
const sampleRate = 44100; // サンプリング周波数、今回は基本的な値として 44100Hz を使用

// 周波数特性を描画
const drawFrequencySpectrum = (frequencyData: Uint8Array) => {
  const ctx = spectrumCanvas.value?.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const maxFrequency = 10000; // 最大10kHzまで表示
    const nyquist = sampleRate / 2;
    const dataLength = Math.floor((maxFrequency / nyquist) * frequencyData.length);
    const filteredData = frequencyData.slice(0, dataLength);

    // 目盛りを描画
    ctx.fillStyle = "black";
    ctx.font = "14px Arial";
    for (let i = 0; i <= maxFrequency; i += 1000) {
      const x = (i / maxFrequency) * canvasWidth;
      ctx.fillText(`${i} Hz`, x, 290);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.strokeStyle = "lightgray";
      ctx.stroke();
    }

    ctx.fillStyle = "blue";
    const barWidth = canvasWidth / filteredData.length;

    filteredData.forEach((value, index) => {
      const barHeight = (value / 255) * 250; // 正規化して高さを計算
      ctx.fillRect(index * barWidth, canvasHeight - barHeight, barWidth - 1, barHeight);
    });
  }
};

// **2倍音、3倍音、および 2.8kHz ~ 3.2kHz の最大振幅を計算**
const getFrequencyIndex = (freq: number, sampleRate: number, fftSize: number) => {
  return Math.round((freq / sampleRate) * fftSize);
};

const harmonic2Ratio = computed(() => {
  if (!props.baseFrequency || props.baseFrequency < 50) return 0;
  const sampleRate = 44100;
  const fftSize = props.frequencyData.length * 2;
  const baseIdx = getFrequencyIndex(props.baseFrequency, sampleRate, fftSize);
  const harmonic2Idx = getFrequencyIndex(props.baseFrequency * 2, sampleRate, fftSize);
  
  if (harmonic2Idx >= props.frequencyData.length) return 0;
  
  const baseAmp = props.frequencyData[baseIdx] || 1;
  const harmonic2Amp = props.frequencyData[harmonic2Idx] || 0;
  
  return (harmonic2Amp / baseAmp) * 100;
});

const harmonic3Ratio = computed(() => {
  if (!props.baseFrequency || props.baseFrequency < 50) return 0;
  const sampleRate = 44100;
  const fftSize = props.frequencyData.length * 2;
  const baseIdx = getFrequencyIndex(props.baseFrequency, sampleRate, fftSize);
  const harmonic3Idx = getFrequencyIndex(props.baseFrequency * 3, sampleRate, fftSize);

  if (harmonic3Idx >= props.frequencyData.length) return 0;

  const baseAmp = props.frequencyData[baseIdx] || 1;
  const harmonic3Amp = props.frequencyData[harmonic3Idx] || 0;

  return (harmonic3Amp / baseAmp) * 100;
});

const bandPeakRatio = computed(() => {
  if (!props.baseFrequency || props.baseFrequency < 50) return 0;
  const sampleRate = 44100;
  const fftSize = props.frequencyData.length * 2;
  const startIdx = getFrequencyIndex(2800, sampleRate, fftSize);
  const endIdx = getFrequencyIndex(3200, sampleRate, fftSize);

  let maxAmp = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    if (props.frequencyData[i] > maxAmp) {
      maxAmp = props.frequencyData[i];
    }
  }

  const baseIdx = getFrequencyIndex(props.baseFrequency, sampleRate, fftSize);
  const baseAmp = props.frequencyData[baseIdx] || 1;

  return (maxAmp / baseAmp) * 100;
});

// 変更を監視
watchEffect(() => {
  drawFrequencySpectrum(props.frequencyData);
});
</script>

<style>
canvas {
  border: 1px solid black;
  margin-bottom: 20px;
}
</style>
