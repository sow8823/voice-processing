<template>
  <div>
    <div class="canvas-wrapper">
      <canvas ref="spectrumCanvas" :width="canvasWidth" :height="canvasHeight"></canvas>
    </div>
    <v-row class="mt-2" dense>
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2" :style="{ borderColor: color }">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">スペクトル傾斜</div>
            <div class="text-body-2 font-weight-bold" :style="{ color }">
              {{ spectralSlope.toFixed(1) }} dB/oct
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2" :style="{ borderColor: color }">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">声区推定</div>
            <div class="text-body-2 font-weight-bold" :style="{ color }">
              {{ voiceType }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2" :style="{ borderColor: color }">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">2.8kHz~3.2kHz 最大成分</div>
            <div class="text-body-2 font-weight-bold" :style="{ color }">
              {{ bandPeakRatio.toFixed(1) }}%
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, watchEffect } from 'vue';
import { frequencyAnalysisService } from '../../services';

const canvasWidth = 800;
const canvasHeight = 200;
const sampleRate = 44100;

const props = defineProps<{
  frequencyData: Uint8Array;
  color: string;
  label?: string;
}>();

const spectrumCanvas = ref<HTMLCanvasElement | null>(null);

// 倍音分析
const harmonicAnalysis = computed(() =>
  frequencyAnalysisService.analyzeHarmonics(props.frequencyData, 0, sampleRate)
);

const spectralSlope = computed(() => harmonicAnalysis.value.spectralSlope);
const bandPeakRatio = computed(() => harmonicAnalysis.value.bandPeakRatio);
const highFreqRatio = computed(() => harmonicAnalysis.value.highFreqRatio);

const voiceType = computed(() => {
  const slope = spectralSlope.value;
  if (highFreqRatio.value < 33.3) return '裏声';
  if (slope >= -10 && slope <= -2) return '地声';
  if (slope > -13 && slope < -10) return '中間';
  if (slope >= -30 && slope <= -13) return '裏声';
  return '不明';
});

const drawSpectrum = (data: Uint8Array) => {
  const ctx = spectrumCanvas.value?.getContext('2d');
  if (!ctx) return;

  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  ctx.clearRect(0, 0, width, height);

  // 背景
  ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  ctx.fillRect(0, 0, width, height);

  const maxFrequency = 10000;
  const nyquist = sampleRate / 2;
  const dataLength = Math.floor((maxFrequency / nyquist) * data.length);
  const filteredData = data.slice(0, dataLength);

  // グリッド線
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= maxFrequency; i += 1000) {
    const x = (i / maxFrequency) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // 周波数ラベル
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i <= maxFrequency; i += 1000) {
    const x = (i / maxFrequency) * width;
    ctx.fillText(`${i}`, x, height - 4);
  }
  ctx.textAlign = 'right';
  ctx.fillText('Hz', width - 4, height - 4);

  // スペクトルバー
  const maxBars = 512;
  const skipFactor = Math.ceil(filteredData.length / maxBars);
  const effectiveLen = Math.ceil(filteredData.length / skipFactor);
  const barWidth = width / effectiveLen;

  // カラーをパース（hex → rgba）
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  };
  const rgb = hexToRgb(props.color);

  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`);
  gradient.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},0.8)`);
  gradient.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},1.0)`);

  for (let i = 0; i < filteredData.length; i += skipFactor) {
    const displayIndex = Math.floor(i / skipFactor);
    let maxVal = filteredData[i];
    for (let j = 1; j < skipFactor && i + j < filteredData.length; j++) {
      if (filteredData[i + j] > maxVal) maxVal = filteredData[i + j];
    }

    const x = displayIndex * barWidth;
    const barH = (maxVal / 255) * (height - 20);

    if (barH > 0) {
      ctx.fillStyle = gradient;
      const bx = x;
      const by = height - barH - 16;
      const bw = Math.max(1, barWidth - 0.5);
      const bh = barH;
      const r = Math.min(2, barWidth / 4);

      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + bw - r, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
      ctx.lineTo(bx + bw, by + bh);
      ctx.lineTo(bx, by + bh);
      ctx.lineTo(bx, by + r);
      ctx.quadraticCurveTo(bx, by, bx + r, by);
      ctx.closePath();
      ctx.fill();
    }
  }
};

watchEffect(() => {
  drawSpectrum(props.frequencyData);
});

watch(spectrumCanvas, (canvas) => {
  if (canvas) drawSpectrum(props.frequencyData);
});

onMounted(() => {
  if (spectrumCanvas.value) drawSpectrum(props.frequencyData);
});
</script>

<style scoped>
.canvas-wrapper {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
}
canvas {
  width: 100%;
  height: auto;
  display: block;
}
</style>
