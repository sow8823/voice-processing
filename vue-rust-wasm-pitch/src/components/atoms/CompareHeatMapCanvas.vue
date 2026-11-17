<template>
  <div>
    <div class="heatmap-container">
      <div class="canvas-wrapper position-relative">
        <canvas ref="heatmapCanvas" :width="heatmapWidth" :height="heatmapHeight"></canvas>
      </div>

      <!-- 凡例 -->
      <div class="legend-container mt-2 d-flex align-center justify-center gap-4">
        <div class="d-flex align-center">
          <div class="legend-swatch" :style="{ background: FILE1_COLOR_CSS }"></div>
          <span class="text-caption ml-1">{{ file1Label }}</span>
        </div>
        <div class="d-flex align-center">
          <div class="legend-swatch" :style="{ background: FILE2_COLOR_CSS }"></div>
          <span class="text-caption ml-1">{{ file2Label }}</span>
        </div>
        <div class="d-flex align-center">
          <div class="legend-swatch overlap-swatch"></div>
          <span class="text-caption ml-1">重複</span>
        </div>
      </div>

      <!-- スクロールコントロール（10秒超の場合のみ） -->
      <div v-if="maxDuration > displayDuration" class="scroll-controls mt-2">
        <v-slider
          v-model="scrollPosition"
          :min="0"
          :max="maxScrollPosition"
          :step="0.001"
          hide-details
          density="compact"
          color="primary"
          track-color="grey-darken-1"
          @update:model-value="handleScroll"
        >
          <template v-slot:prepend>
            <v-icon size="small" color="primary">mdi-arrow-left</v-icon>
          </template>
          <template v-slot:append>
            <v-icon size="small" color="primary">mdi-arrow-right</v-icon>
          </template>
        </v-slider>
        <div class="d-flex justify-space-between text-caption mt-1">
          <span>{{ formatTime(viewStartTime) }}</span>
          <span>表示範囲: {{ formatTime(viewStartTime) }} - {{ formatTime(viewEndTime) }}</span>
          <span>{{ formatTime(maxDuration) }}</span>
        </div>
      </div>
    </div>

    <!-- 統計情報 -->
    <v-row class="mt-3">
      <!-- ファイル1 -->
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="pa-2" :style="{ borderColor: FILE1_COLOR_CSS }">
          <v-card-title class="text-subtitle-2 pb-1" :style="{ color: FILE1_COLOR_CSS }">
            {{ file1Label }}
          </v-card-title>
          <v-card-text class="pa-2">
            <v-row dense>
              <v-col cols="6">
                <div class="text-caption text-medium-emphasis">スペクトル傾斜平均</div>
                <div class="text-body-2 font-weight-bold">
                  {{ file1Stats.spectralSlopeAvg !== undefined ? file1Stats.spectralSlopeAvg.toFixed(1) : '0.0' }} dB/oct
                </div>
              </v-col>
              <v-col cols="6">
                <div class="text-caption text-medium-emphasis">声区推定</div>
                <div class="text-body-2 font-weight-bold">{{ getVoiceTypeFromSlope(file1Stats.spectralSlopeAvg) }}</div>
              </v-col>
              <v-col cols="12">
                <div class="text-caption text-medium-emphasis">2.8kHz~3.2kHz 最大成分平均</div>
                <div class="text-body-2 font-weight-bold">
                  {{ file1Stats.bandPeakAvg !== undefined ? file1Stats.bandPeakAvg.toFixed(1) : '0.0' }}%
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- ファイル2 -->
      <v-col cols="12" md="6">
        <v-card variant="outlined" class="pa-2" :style="{ borderColor: FILE2_COLOR_CSS }">
          <v-card-title class="text-subtitle-2 pb-1" :style="{ color: FILE2_COLOR_CSS }">
            {{ file2Label }}
          </v-card-title>
          <v-card-text class="pa-2">
            <v-row dense>
              <v-col cols="6">
                <div class="text-caption text-medium-emphasis">スペクトル傾斜平均</div>
                <div class="text-body-2 font-weight-bold">
                  {{ file2Stats.spectralSlopeAvg !== undefined ? file2Stats.spectralSlopeAvg.toFixed(1) : '0.0' }} dB/oct
                </div>
              </v-col>
              <v-col cols="6">
                <div class="text-caption text-medium-emphasis">声区推定</div>
                <div class="text-body-2 font-weight-bold">{{ getVoiceTypeFromSlope(file2Stats.spectralSlopeAvg) }}</div>
              </v-col>
              <v-col cols="12">
                <div class="text-caption text-medium-emphasis">2.8kHz~3.2kHz 最大成分平均</div>
                <div class="text-body-2 font-weight-bold">
                  {{ file2Stats.bandPeakAvg !== undefined ? file2Stats.bandPeakAvg.toFixed(1) : '0.0' }}%
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, watchEffect } from 'vue';

// ファイル1: 青系、ファイル2: 赤/オレンジ系
const FILE1_COLOR_CSS = '#42a5f5'; // 青
const FILE2_COLOR_CSS = '#ef5350'; // 赤

const props = defineProps<{
  file1Data: {
    frequencyData: Uint8Array[];
    timestamps: number[];
  } | null;
  file2Data: {
    frequencyData: Uint8Array[];
    timestamps: number[];
  } | null;
  file1Duration?: number;
  file2Duration?: number;
  file1Label?: string;
  file2Label?: string;
  currentPlaybackTime?: number;
}>();

const heatmapCanvas = ref<HTMLCanvasElement | null>(null);
const sampleRate = 44100;

const heatmapWidth = 800;
const heatmapHeight = 300;

const displayDuration = 10;
const scrollPosition = ref<number>(0);
const viewStartTime = ref<number>(0);
const viewEndTime = ref<number>(displayDuration);

// 2ファイルのうち長い方の長さを基準にする
const maxDuration = computed(() => {
  const d1 = props.file1Duration ?? 0;
  const d2 = props.file2Duration ?? 0;
  return Math.max(d1, d2);
});

const maxScrollPosition = computed(() => {
  if (maxDuration.value <= displayDuration) return 0;
  return Math.max(0, (maxDuration.value - displayDuration) / maxDuration.value);
});

// 統計情報
const file1Stats = ref({ spectralSlopeAvg: 0, bandPeakAvg: 0 });
const file2Stats = ref({ spectralSlopeAvg: 0, bandPeakAvg: 0 });

const handleScroll = (value: number) => {
  viewStartTime.value = value * maxDuration.value;
  viewEndTime.value = Math.min(maxDuration.value, viewStartTime.value + displayDuration);
  updateHeatmap();
};

const formatTime = (seconds: number): string => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

// ファイル1用カラー（青系グラデーション）
const getColorFile1 = (value: number): [number, number, number, number] => {
  if (value === 0) return [0, 0, 0, 0];
  const t = value / 255;
  // 暗い青 → 明るい水色
  const r = Math.round(0 + 100 * t);
  const g = Math.round(50 + 180 * t);
  const b = Math.round(150 + 105 * t);
  const a = Math.round(80 + 175 * t);
  return [r, g, b, a];
};

// ファイル2用カラー（赤/オレンジ系グラデーション）
const getColorFile2 = (value: number): [number, number, number, number] => {
  if (value === 0) return [0, 0, 0, 0];
  const t = value / 255;
  // 暗い赤 → 明るいオレンジ/黄
  const r = Math.round(150 + 105 * t);
  const g = Math.round(20 + 200 * t);
  const b = Math.round(0);
  const a = Math.round(80 + 175 * t);
  return [r, g, b, a];
};

// アルファブレンド（背景は黒）
const blendOnBlack = (
  r: number, g: number, b: number, a: number
): [number, number, number] => {
  const alpha = a / 255;
  return [
    Math.round(r * alpha),
    Math.round(g * alpha),
    Math.round(b * alpha),
  ];
};

// 2色を加算合成（重複部分を明るく）
const addBlend = (
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
): [number, number, number] => {
  return [
    Math.min(255, r1 + r2),
    Math.min(255, g1 + g2),
    Math.min(255, b1 + b2),
  ];
};

// 対数スケールで周波数 → y座標に変換（低周波が下、高周波が上）
const freqToY = (freq: number, height: number, minFreq: number, maxFreq: number): number => {
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const logFreq = Math.log10(Math.max(freq, minFreq));
  // 低周波が下（height）、高周波が上（0）
  return height - ((logFreq - logMin) / (logMax - logMin)) * height;
};

const drawScalesAndMarkers = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const minFreq = 50;
  const maxFreq = 10000;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';

  // 対数スケールの目盛り周波数
  const tickFreqs = [100, 200, 500, 1000, 2000, 5000, 10000];
  for (const freq of tickFreqs) {
    const y = freqToY(freq, height, minFreq, maxFreq);
    const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
    ctx.fillText(label, 28, y + 4);

    // 補助線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 軸ラベル
  ctx.textAlign = 'center';
  ctx.fillText('時間', width / 2, height - 5);

  ctx.save();
  ctx.translate(10, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('周波数 (Hz, 対数)', 0, 0);
  ctx.restore();
};

// 対数スケール描画用: y座標 → 周波数（対数スケール）
const yToFreqLog = (y: number, height: number, minFreq: number, maxFreq: number): number => {
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  // y=0が上（高周波）、y=height-1が下（低周波）
  const t = 1 - y / height;
  return Math.pow(10, logMin + t * (logMax - logMin));
};

const renderFileData = (
  imageData: ImageData,
  width: number,
  height: number,
  fileData: { frequencyData: Uint8Array[]; timestamps: number[] },
  colorFn: (v: number) => [number, number, number, number],
  viewStart: number,
  viewEnd: number
) => {
  const { frequencyData, timestamps } = fileData;
  const displayTimeRange = viewEnd - viewStart;
  const timeResolution = width / displayTimeRange;
  const minFreq = 50;
  const maxFreq = 10000;
  const nyquist = sampleRate / 2;

  for (let frameIndex = 0; frameIndex < frequencyData.length; frameIndex++) {
    const frameTime = timestamps[frameIndex];
    if (frameTime < viewStart || frameTime > viewEnd) continue;

    const relativeTime = frameTime - viewStart;
    const x = Math.floor(relativeTime * timeResolution);
    if (x < 0 || x >= width) continue;

    const frameData = frequencyData[frameIndex];
    const fftBins = frameData.length; // ナイキスト以下のビン数

    // 各ピクセル行（y）に対して対数スケールで周波数を計算し、対応するFFTビンの値を取得
    for (let y = 0; y < height; y++) {
      // このピクセルに対応する周波数（対数スケール）
      const freq = yToFreqLog(y, height, minFreq, maxFreq);
      if (freq > nyquist) continue;

      // 周波数 → FFTビンインデックス
      const binIdx = Math.round((freq / nyquist) * fftBins);
      if (binIdx < 0 || binIdx >= fftBins) continue;

      // 隣接ビンとの補間（アンチエイリアシング）
      const binIdxNext = Math.min(binIdx + 1, fftBins - 1);
      const frac = (freq / nyquist) * fftBins - binIdx;
      const value = Math.round(frameData[binIdx] * (1 - frac) + frameData[binIdxNext] * frac);

      if (value === 0) continue;

      const [cr, cg, cb, ca] = colorFn(value);
      const index = (y * width + x) * 4;
      if (index < 0 || index >= imageData.data.length - 3) continue;

      // 既存ピクセルと加算合成
      const existR = imageData.data[index];
      const existG = imageData.data[index + 1];
      const existB = imageData.data[index + 2];

      const [nr, ng, nb] = blendOnBlack(cr, cg, cb, ca);
      const [fr, fg, fb] = addBlend(existR, existG, existB, nr, ng, nb);

      imageData.data[index] = fr;
      imageData.data[index + 1] = fg;
      imageData.data[index + 2] = fb;
      imageData.data[index + 3] = 255;
    }
  }
};

const updateHeatmap = () => {
  const ctx = heatmapCanvas.value?.getContext('2d');
  if (!ctx) return;

  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
  ctx.fillRect(0, 0, width, height);

  // 表示範囲を計算
  if (maxDuration.value > displayDuration) {
    viewStartTime.value = scrollPosition.value * maxDuration.value;
    viewEndTime.value = Math.min(maxDuration.value, viewStartTime.value + displayDuration);
  } else {
    viewStartTime.value = 0;
    viewEndTime.value = displayDuration;
  }

  const imageData = ctx.createImageData(width, height);

  // 背景を黒で初期化
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 0;
    imageData.data[i + 1] = 0;
    imageData.data[i + 2] = 0;
    imageData.data[i + 3] = 255;
  }

  // ファイル1を描画（青系）
  if (props.file1Data && props.file1Data.frequencyData.length > 0) {
    renderFileData(
      imageData, width, height,
      props.file1Data,
      getColorFile1,
      viewStartTime.value, viewEndTime.value
    );
  }

  // ファイル2を描画（赤系）- 加算合成で重ねる
  if (props.file2Data && props.file2Data.frequencyData.length > 0) {
    renderFileData(
      imageData, width, height,
      props.file2Data,
      getColorFile2,
      viewStartTime.value, viewEndTime.value
    );
  }

  ctx.putImageData(imageData, 0, 0);

  // 目盛りとマーカーを描画
  drawScalesAndMarkers(ctx, width, height);

  // 時間軸の目盛り
  const displayTimeRange = viewEndTime.value - viewStartTime.value;
  const timeResolution = width / displayTimeRange;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';

  for (let t = 0; t <= displayDuration; t += 1) {
    const x = Math.floor(t * timeResolution);
    if (x >= 0 && x < width) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - 20);
      ctx.stroke();
      ctx.fillText(`${Math.floor(viewStartTime.value) + t}s`, x, height - 5);
    }
  }

  // ファイル1の終端線
  if (props.file1Duration && props.file1Duration < maxDuration.value) {
    const relEnd = props.file1Duration - viewStartTime.value;
    if (relEnd >= 0 && relEnd <= displayTimeRange) {
      const endX = Math.floor(relEnd * timeResolution);
      ctx.strokeStyle = FILE1_COLOR_CSS + 'aa';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ファイル2の終端線
  if (props.file2Duration && props.file2Duration < maxDuration.value) {
    const relEnd = props.file2Duration - viewStartTime.value;
    if (relEnd >= 0 && relEnd <= displayTimeRange) {
      const endX = Math.floor(relEnd * timeResolution);
      ctx.strokeStyle = FILE2_COLOR_CSS + 'aa';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 再生位置ライン
  if (props.currentPlaybackTime !== undefined && maxDuration.value > 0) {
    const relTime = props.currentPlaybackTime - viewStartTime.value;
    if (relTime >= 0 && relTime <= displayTimeRange) {
      const playX = Math.floor(relTime * timeResolution);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();
    }
  }
};

// 統計情報を計算
const computeStats = (
  fileData: { frequencyData: Uint8Array[]; timestamps: number[] } | null
): { spectralSlopeAvg: number; bandPeakAvg: number } => {
  if (!fileData || fileData.frequencyData.length === 0) {
    return { spectralSlopeAvg: 0, bandPeakAvg: 0 };
  }

  let slopeSum = 0;
  let bandSum = 0;
  let count = 0;

  for (const frame of fileData.frequencyData) {
    // スペクトル傾斜を簡易計算
    const startIdx = Math.round((200 / (sampleRate / 2)) * frame.length);
    const endIdx = Math.round((5000 / (sampleRate / 2)) * frame.length);

    const freqs: number[] = [];
    const ampsDB: number[] = [];

    for (let i = startIdx; i <= endIdx && i < frame.length; i++) {
      if (frame[i] > 0) {
        const freq = (i / (frame.length * 2)) * sampleRate;
        freqs.push(Math.log2(freq));
        ampsDB.push(20 * Math.log10(frame[i] / 255));
      }
    }

    if (freqs.length >= 2) {
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      const n = freqs.length;
      for (let i = 0; i < n; i++) {
        sumX += freqs[i];
        sumY += ampsDB[i];
        sumXY += freqs[i] * ampsDB[i];
        sumX2 += freqs[i] * freqs[i];
      }
      const denom = n * sumX2 - sumX * sumX;
      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        slopeSum += Math.max(-30, Math.min(-2, slope));
      }
    }

    // 2.8kHz~3.2kHz バンドピーク
    const bandStart = Math.round((2800 / (sampleRate / 2)) * frame.length);
    const bandEnd = Math.round((3200 / (sampleRate / 2)) * frame.length);
    let maxAmp = 0;
    const baseIdx = Math.round((200 / (sampleRate / 2)) * frame.length);
    const baseAmp = frame[baseIdx] || 1;
    for (let i = bandStart; i <= bandEnd && i < frame.length; i++) {
      if (frame[i] > maxAmp) maxAmp = frame[i];
    }
    bandSum += (maxAmp / baseAmp) * 100;
    count++;
  }

  if (count === 0) return { spectralSlopeAvg: 0, bandPeakAvg: 0 };
  return {
    spectralSlopeAvg: slopeSum / count,
    bandPeakAvg: bandSum / count,
  };
};

const getVoiceTypeFromSlope = (slope: number | undefined): string => {
  if (slope === undefined || slope === 0) return '-';
  if (slope >= -10 && slope <= -6) return '地声';
  if (slope > -13 && slope < -10) return '中間';
  if (slope >= -18 && slope <= -13) return '裏声';
  return '不明';
};

// データが変わったら統計を再計算してヒートマップを更新
watchEffect(() => {
  file1Stats.value = computeStats(props.file1Data);
  file2Stats.value = computeStats(props.file2Data);
  updateHeatmap();
});

watch(heatmapCanvas, (canvas) => {
  if (canvas) updateHeatmap();
});

onMounted(() => {
  if (heatmapCanvas.value) updateHeatmap();
});

defineExpose({ updateHeatmap });
</script>

<style scoped>
.heatmap-container {
  width: 100%;
  position: relative;
}

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

.scroll-controls {
  padding: 0 8px;
}

.legend-container {
  flex-wrap: wrap;
  gap: 16px;
}

.legend-swatch {
  width: 24px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}

.overlap-swatch {
  background: linear-gradient(to right, #42a5f5, #a0c4a0, #ef5350);
}
</style>
