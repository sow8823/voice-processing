<template>
  <canvas ref="heatmapCanvas" :width="heatmapWidth" :height="heatmapHeight" style="background-color: black;"></canvas>
  <p>2倍音強度平均: {{ harmonic2Avg.toFixed(2) }}%</p>
  <p>3倍音強度平均: {{ harmonic3Avg.toFixed(2) }}%</p>
  <p>2.8kHz~3.2kHz 最大成分平均: {{ bandPeakAvg.toFixed(2) }}%</p>
</template>

<script setup lang="ts">
import { ref, defineProps, watchEffect, computed } from "vue";
const props = defineProps<{ frequencyData: Uint8Array; baseFrequency: number }>();

const heatmapCanvas = ref<HTMLCanvasElement | null>(null);
const sampleRate = 44100; // サンプリング周波数、今回は基本的な値として 44100Hz を使用

const heatmapWidth = 800;
const heatmapHeight = 300;


// ヒートマップ用データを動的に管理
const heatmapBuffer: Uint8Array[] = Array.from({ length: heatmapHeight }, () => new Uint8Array(heatmapWidth));
let currentRow = 0; // ヒートマップの現在行

const updateHeatmap = (frequencyData: Uint8Array) => {
  const ctx = heatmapCanvas.value?.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, heatmapWidth, heatmapHeight);

    const maxFrequency = 10000;
    const nyquist = sampleRate / 2;
    const dataLength = Math.floor((maxFrequency / nyquist) * frequencyData.length);
    const filteredData = frequencyData.slice(0, dataLength);

    // filteredData をヒートマップの幅に合わせてスケール
    const scaledFilteredData = new Uint8Array(heatmapWidth);
    const scaleFactor = filteredData.length / heatmapWidth;

    for (let x = 0; x < heatmapWidth; x++) {
      const sourceIndex = Math.floor(x * scaleFactor);
      scaledFilteredData[x] = filteredData[sourceIndex];
    }

    // 古い行をヒートマップバッファに追加
    heatmapBuffer[currentRow].set(scaledFilteredData);

    // 次の行に進む（行の循環）
    currentRow = (currentRow + 1) % heatmapHeight;

    // ピクセルごとの色を設定
    const imageData = ctx.createImageData(heatmapWidth, heatmapHeight);

    for (let y = 0; y < heatmapHeight; y++) {
      const rowIndex = (currentRow + y) % heatmapHeight;
      for (let x = 0; x < heatmapWidth; x++) {
        const value = heatmapBuffer[rowIndex][x];
        const intensity = (value / 255) * 255; // 正規化して強度を計算
        const index = (y * heatmapWidth + x) * 4;

        if (value === 0) {
          // データがない場合は黒に設定
          imageData.data[index] = 0;     // R
          imageData.data[index + 1] = 0; // G
          imageData.data[index + 2] = 0; // B
          imageData.data[index + 3] = 255; // A
        } else {
          // データがある場合は青から白のグラデーション
          imageData.data[index] = intensity; // R
          imageData.data[index + 1] = intensity; // G
          imageData.data[index + 2] = 255; // B
          imageData.data[index + 3] = 255; // A
        }
      }
    }

    // ヒートマップを描画
    ctx.putImageData(imageData, 0, 0);
  }
};

// **比率を記録するキュー（過去5秒分を保存）**
const harmonic2Queue = ref<number[]>([]);
const harmonic3Queue = ref<number[]>([]);
const bandPeakQueue = ref<number[]>([]);

const maxQueueSize = heatmapHeight; // ヒートマップの行数（約5秒分）

// **倍音比率の計算**
const getFrequencyIndex = (freq: number, sampleRate: number, fftSize: number) => {
  return Math.round((freq / sampleRate) * fftSize);
};

const updateHarmonicRatios = () => {
  console.log(harmonic2Queue.value);
  if (!props.baseFrequency || props.baseFrequency < 50) return;

  const fftSize = props.frequencyData.length * 2;
  const baseIdx = getFrequencyIndex(props.baseFrequency, sampleRate, fftSize);
  const harmonic2Idx = getFrequencyIndex(props.baseFrequency * 2, sampleRate, fftSize);
  const harmonic3Idx = getFrequencyIndex(props.baseFrequency * 3, sampleRate, fftSize);

  if (harmonic2Idx >= props.frequencyData.length || harmonic3Idx >= props.frequencyData.length) return;

  const baseAmp = props.frequencyData[baseIdx] || 1;
  const harmonic2Amp = props.frequencyData[harmonic2Idx] || 0;
  const harmonic3Amp = props.frequencyData[harmonic3Idx] || 0;

  // **2倍音・3倍音比率をキューに保存**
  const harmonic2Ratio = (harmonic2Amp / baseAmp) * 100;
  const harmonic3Ratio = (harmonic3Amp / baseAmp) * 100;

  harmonic2Queue.value.push(harmonic2Ratio);
  harmonic3Queue.value.push(harmonic3Ratio);

  if (harmonic2Queue.value.length > maxQueueSize) harmonic2Queue.value.shift();
  if (harmonic3Queue.value.length > maxQueueSize) harmonic3Queue.value.shift();

  // **2.8kHz~3.2kHz の最大比率をキューに保存**
  const startIdx = getFrequencyIndex(2800, sampleRate, fftSize);
  const endIdx = getFrequencyIndex(3200, sampleRate, fftSize);

  let maxAmp = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    if (props.frequencyData[i] > maxAmp) {
      maxAmp = props.frequencyData[i];
    }
  }

  const bandPeakRatio = (maxAmp / baseAmp) * 100;
  bandPeakQueue.value.push(bandPeakRatio);
  if (bandPeakQueue.value.length > maxQueueSize) bandPeakQueue.value.shift();
};

// **5秒間の平均を計算**
const harmonic2Avg = computed(() => {
  return harmonic2Queue.value.length > 0
    ? harmonic2Queue.value.reduce((sum, val) => sum + val, 0) / harmonic2Queue.value.length
    : 0;
});

const harmonic3Avg = computed(() => {
  return harmonic3Queue.value.length > 0
    ? harmonic3Queue.value.reduce((sum, val) => sum + val, 0) / harmonic3Queue.value.length
    : 0;
});

const bandPeakAvg = computed(() => {
  return bandPeakQueue.value.length > 0
    ? bandPeakQueue.value.reduce((sum, val) => sum + val, 0) / bandPeakQueue.value.length
    : 0;
});

// **データ更新**
watchEffect(() => {
  updateHarmonicRatios();
});

watchEffect(() => {
  updateHeatmap(props.frequencyData);
});

// // **2倍音、3倍音、および 2.8kHz ~ 3.2kHz の最大振幅を計算**
// const getFrequencyIndex = (freq: number, sampleRate: number, fftSize: number) => {
//   return Math.round((freq / sampleRate) * fftSize);
// };

// const harmonic2Avg = computed(() => {
//   if (!props.baseFrequency || props.baseFrequency < 50) return 0;
//   const sampleRate = 44100;
//   const fftSize = props.frequencyData.length * 2;
//   const baseIdx = getFrequencyIndex(props.baseFrequency, sampleRate, fftSize);
//   const harmonic2Idx = getFrequencyIndex(props.baseFrequency * 2, sampleRate, fftSize);
  
//   if (harmonic2Idx >= props.frequencyData.length) return 0;
  
//   const baseAmp = props.frequencyData[baseIdx] || 1;
//   const harmonic2Amp = props.frequencyData[harmonic2Idx] || 0;
  
//   return (harmonic2Amp / baseAmp) * 100;
// });

// const harmonic3Avg = computed(() => {
//   if (!props.baseFrequency || props.baseFrequency < 50) return 0;
//   const sampleRate = 44100;
//   const fftSize = props.frequencyData.length * 2;
//   const baseIdx = getFrequencyIndex(props.baseFrequency, sampleRate, fftSize);
//   const harmonic3Idx = getFrequencyIndex(props.baseFrequency * 3, sampleRate, fftSize);

//   if (harmonic3Idx >= props.frequencyData.length) return 0;

//   const baseAmp = props.frequencyData[baseIdx] || 1;
//   const harmonic3Amp = props.frequencyData[harmonic3Idx] || 0;

//   return (harmonic3Amp / baseAmp) * 100;
// });

// const bandPeakAvg = computed(() => {
//   if (!props.baseFrequency || props.baseFrequency < 50) return 0;
//   const sampleRate = 44100;
//   const fftSize = props.frequencyData.length * 2;
//   const startIdx = getFrequencyIndex(2800, sampleRate, fftSize);
//   const endIdx = getFrequencyIndex(3200, sampleRate, fftSize);

//   let maxAmp = 0;
//   for (let i = startIdx; i <= endIdx; i++) {
//     if (props.frequencyData[i] > maxAmp) {
//       maxAmp = props.frequencyData[i];
//     }
//   }

//   const baseIdx = getFrequencyIndex(props.baseFrequency, sampleRate, fftSize);
//   const baseAmp = props.frequencyData[baseIdx] || 1;

//   return (maxAmp / baseAmp) * 100;
// });

</script>

<style>
canvas {
  border: 1px solid black;
  margin-bottom: 20px;
}
</style>


