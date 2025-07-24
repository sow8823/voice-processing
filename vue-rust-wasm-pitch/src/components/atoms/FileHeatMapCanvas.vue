<template>
  <div>
    <div class="heatmap-container">
      <div class="canvas-wrapper position-relative">
        <canvas ref="heatmapCanvas" :width="heatmapWidth" :height="heatmapHeight"></canvas>
      </div>
      
      <!-- ファイルの長さが10秒を超える場合にのみスクロールコントロールを表示 -->
      <div v-if="props.duration && props.duration > displayDuration" class="scroll-controls mt-2">
        <v-slider
          v-model="scrollPosition"
          :min="0"
          :max="maxScrollPosition"
          :step="0.01"
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
          <span>{{ formatTime(totalDuration) }}</span>
        </div>
      </div>
    </div>
    
    <v-row class="mt-2">
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">スペクトル傾斜平均</div>
            <div class="text-h6 font-weight-bold accent--text">{{ spectralSlopeAvg !== undefined ? spectralSlopeAvg.toFixed(1) : '0.0' }} dB/oct</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">声区推定</div>
            <div class="text-h6 font-weight-bold accent--text">{{ getVoiceTypeFromSlope(spectralSlopeAvg) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">2.8kHz~3.2kHz 最大成分平均</div>
            <div class="text-h6 font-weight-bold accent--text">{{ bandPeakAvg !== undefined ? bandPeakAvg.toFixed(1) : '0.0' }}%</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, defineExpose, watchEffect, computed, watch, onMounted } from "vue";
import { useTheme } from "vuetify";
import { frequencyAnalysisService } from "../../services";

const props = defineProps<{
  frequencyData: Uint8Array;
  baseFrequency: number;
  analysisData: {
    frequencyData: Uint8Array[];
    timestamps: number[];
  };
  currentPlaybackTime?: number;
  duration?: number;
}>();

const heatmapCanvas = ref<HTMLCanvasElement | null>(null);
const sampleRate = 44100; // サンプリング周波数、今回は基本的な値として 44100Hz を使用
const theme = useTheme();

// キャンバスサイズ
const heatmapWidth = 800;
const heatmapHeight = 300;

// 表示設定
const displayDuration = 10; // 表示する時間範囲（秒）
const scrollPosition = ref<number>(0); // スクロール位置（0-1の範囲）
const viewStartTime = ref<number>(0); // 表示開始時間（秒）
const viewEndTime = ref<number>(displayDuration); // 表示終了時間（秒）
const totalDuration = ref<number>(displayDuration); // 音声ファイルの総再生時間（秒）

// 最大スクロール位置
const maxScrollPosition = computed(() => {
  if (!props.duration) return 0;
  return Math.max(0, (props.duration - displayDuration) / props.duration);
});

// スクロール位置が変更されたときの処理
const handleScroll = (value: number) => {
  if (!props.duration) return;
  
  // 表示範囲を計算
  viewStartTime.value = value * props.duration;
  viewEndTime.value = Math.min(props.duration, viewStartTime.value + displayDuration);
  totalDuration.value = props.duration;
  
  // ヒートマップを更新
  updateHeatmap();
};

// 時間を「分:秒.ミリ秒」形式にフォーマットする関数
const formatTime = (seconds: number): string => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

// カラーマップ関数 - 値に応じて色を返す
const getColor = (value: number): [number, number, number, number] => {
  // 値を0-1の範囲に正規化
  const normalizedValue = value / 255;
  
  if (value === 0) {
    return [0, 0, 0, 255]; // 黒
  }
  
  // 青から紫、ピンク、オレンジ、黄色へのグラデーション
  if (normalizedValue < 0.25) {
    // 青から紫 (0-0.25)
    const t = normalizedValue / 0.25;
    return [
      Math.round(72 * t), // R: 0 -> 72
      Math.round(20 * t), // G: 0 -> 20
      Math.round(180 + 75 * t), // B: 180 -> 255
      255 // A
    ];
  } else if (normalizedValue < 0.5) {
    // 紫からピンク (0.25-0.5)
    const t = (normalizedValue - 0.25) / 0.25;
    return [
      Math.round(72 + 175 * t), // R: 72 -> 247
      Math.round(20 + 17 * t), // G: 20 -> 37
      255, // B: 255
      255 // A
    ];
  } else if (normalizedValue < 0.75) {
    // ピンクからオレンジ (0.5-0.75)
    const t = (normalizedValue - 0.5) / 0.25;
    return [
      247, // R: 247
      Math.round(37 + 153 * t), // G: 37 -> 190
      Math.round(255 - 144 * t), // B: 255 -> 111
      255 // A
    ];
  } else {
    // オレンジから黄色 (0.75-1.0)
    const t = (normalizedValue - 0.75) / 0.25;
    return [
      247, // R: 247
      Math.round(190 + 65 * t), // G: 190 -> 255
      Math.round(111 - 111 * t), // B: 111 -> 0
      255 // A
    ];
  }
};

// 目盛りとマーカーを描画する関数
const drawScalesAndMarkers = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const maxFrequency = 10000;
  
  // 周波数目盛りを描画（y軸）
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  
  for (let i = 0; i <= maxFrequency; i += 2000) {
    // 周波数を反転（低周波数が下、高周波数が上）
    const y = height - (i / maxFrequency) * height;
    ctx.fillText(`${i/1000}k`, 25, y);
  }
  
  // 時間軸のラベル（x軸）
  ctx.textAlign = 'center';
  ctx.fillText('時間', width / 2, height - 5);
  
  // 周波数軸のラベル（y軸）
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('周波数 (Hz)', 0, 0);
  ctx.restore();
};

// ファイル分析用のヒートマップ更新関数
const updateHeatmap = () => {
  if (!props.analysisData || !props.duration) return;
  
  const ctx = heatmapCanvas.value?.getContext("2d");
  if (!ctx) return;
  
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  
  ctx.clearRect(0, 0, width, height);

  // 背景を黒に設定
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.fillRect(0, 0, width, height);

  const maxFrequency = 10000;
  const nyquist = sampleRate / 2;
  
  // ファイル全体のヒートマップを描画するためのイメージデータ
  const imageData = ctx.createImageData(width, height);
  
  // 分析データの各フレームをヒートマップに配置
  const { frequencyData, timestamps } = props.analysisData;
  
  // 表示範囲を更新
  totalDuration.value = props.duration;
  
  // 表示範囲は常に10秒固定
  // スクロール位置に基づいて表示範囲を計算
  if (props.duration > displayDuration) {
    viewStartTime.value = scrollPosition.value * props.duration;
    viewEndTime.value = Math.min(props.duration, viewStartTime.value + displayDuration);
  } else {
    // ファイルが10秒以下の場合でも、表示範囲は0から10秒に固定
    viewStartTime.value = 0;
    viewEndTime.value = displayDuration;
  }
  
  // 画像データを初期化（黒で塗りつぶし）
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 0;       // R
    imageData.data[i + 1] = 0;   // G
    imageData.data[i + 2] = 0;   // B
    imageData.data[i + 3] = 255; // A
  }
  
  // 表示範囲の時間に対する解像度を計算
  const displayTimeRange = viewEndTime.value - viewStartTime.value;
  const timeResolution = width / displayTimeRange;
  
  // 各フレームの周波数データをヒートマップに配置
  for (let frameIndex = 0; frameIndex < frequencyData.length; frameIndex++) {
    // フレームの時間位置
    const frameTime = timestamps[frameIndex];
    
    // 表示範囲内のフレームのみ処理
    if (frameTime >= viewStartTime.value && frameTime <= viewEndTime.value) {
      // 表示範囲内での相対位置を計算
      const relativeTime = frameTime - viewStartTime.value;
      const x = Math.floor(relativeTime * timeResolution);
      
      if (x >= 0 && x < width) {
        const frameData = frequencyData[frameIndex];
        const dataLength = Math.floor((maxFrequency / nyquist) * frameData.length);
        const filteredData = frameData.slice(0, dataLength);
        
        // filteredData をヒートマップの高さに合わせてスケール
        const scaledData = frequencyAnalysisService.scaleFrequencyData(
          filteredData,
          height,
          maxFrequency,
          sampleRate
        );
        
        // このフレームのデータを画像の対応する列に配置
        for (let y = 0; y < height; y++) {
          const value = scaledData[y];
          const [r, g, b, a] = getColor(value);
          const index = (y * width + x) * 4;
          
          // インデックスが有効な範囲内かチェック
          if (index >= 0 && index < imageData.data.length - 3) {
            imageData.data[index] = r;     // R
            imageData.data[index + 1] = g; // G
            imageData.data[index + 2] = b; // B
            imageData.data[index + 3] = a; // A
          }
        }
      }
    }
  }
  
  // ヒートマップを描画
  ctx.putImageData(imageData, 0, 0);
  
  // 目盛りとマーカーを描画
  drawScalesAndMarkers(ctx, width, height);
  
  // 時間軸の目盛りを追加（常に0から10秒まで）
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  
  // 1秒ごとに目盛りを表示
  const secondStep = 1; // 1秒ごと
  for (let t = 0; t <= displayDuration; t += secondStep) {
    // 表示範囲内での相対位置を計算
    const relativeTime = t;
    const x = Math.floor(relativeTime * timeResolution);
    
    if (x >= 0 && x < width) {
      // 目盛り線
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - 20);
      ctx.stroke();
      
      // 時間ラベル
      ctx.fillText(`${Math.floor(viewStartTime.value) + t}s`, x, height - 5);
    }
  }
  
  // ファイルの実際の長さを示す縦線（ファイルが10秒未満の場合）
  if (props.duration && props.duration < displayDuration) {
    const fileEndX = Math.floor(props.duration * timeResolution);
    
    // ファイル終了位置に縦線を描画
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'; // 黄色の半透明
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fileEndX, 0);
    ctx.lineTo(fileEndX, height);
    ctx.stroke();
    
    // ファイル終了位置にラベルを表示
    ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('ファイル終了', fileEndX, 15);
  }
  
  // 現在の再生位置を示す白いラインを描画
  if (props.currentPlaybackTime !== undefined && props.duration && props.duration > 0) {
    // 再生位置が表示範囲内かチェック
    if (props.currentPlaybackTime >= viewStartTime.value && props.currentPlaybackTime <= viewEndTime.value) {
      // 表示範囲内での相対位置を計算
      const relativeTime = props.currentPlaybackTime - viewStartTime.value;
      const playbackX = Math.floor(relativeTime * timeResolution);
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playbackX, 0);
      ctx.lineTo(playbackX, height);
      ctx.stroke();
    }
  }
};

// スペクトル傾斜から声区を推定する関数
function getVoiceTypeFromSlope(slope: number | undefined): string {
  if (slope === undefined) return '-';
  
  if (slope >= -10 && slope <= -6) {
    return '地声';
  } else if (slope > -13 && slope < -10) {
    return '中間';
  } else if (slope >= -18 && slope <= -13) {
    return '裏声';
  } else {
    return '不明';
  }
}

// 比率を記録するキュー（過去5秒分を保存）
const spectralSlopeQueue = ref<number[]>([]);
const bandPeakQueue = ref<number[]>([]);

const maxQueueSize = heatmapWidth; // ヒートマップの列数（約5秒分）

// 倍音比率の計算
const getFrequencyIndex = (freq: number, sampleRate: number, fftSize: number) => {
  return frequencyAnalysisService.getFrequencyIndex(freq, sampleRate, fftSize);
};

const updateHarmonicRatios = () => {
  if (!props.baseFrequency || props.baseFrequency < 50) return;

  // FrequencyAnalysisServiceを使用してスペクトル傾斜を計算
  const harmonicResult = frequencyAnalysisService.analyzeHarmonics(
    props.frequencyData,
    props.baseFrequency,
    sampleRate
  );

  // スペクトル傾斜をキューに保存
  spectralSlopeQueue.value.push(harmonicResult.spectralSlope);
  if (spectralSlopeQueue.value.length > maxQueueSize) spectralSlopeQueue.value.shift();

  const fftSize = props.frequencyData.length * 2;
  const baseIdx = getFrequencyIndex(props.baseFrequency, sampleRate, fftSize);
  const baseAmp = props.frequencyData[baseIdx] || 1;

  // 2.8kHz~3.2kHz の最大比率をキューに保存
  const startIdx = getFrequencyIndex(2800, sampleRate, fftSize);
  const endIdx = getFrequencyIndex(3200, sampleRate, fftSize);

  let maxAmp = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    if (i < props.frequencyData.length && props.frequencyData[i] > maxAmp) {
      maxAmp = props.frequencyData[i];
    }
  }

  const bandPeakRatio = (maxAmp / baseAmp) * 100;
  bandPeakQueue.value.push(bandPeakRatio);
  if (bandPeakQueue.value.length > maxQueueSize) bandPeakQueue.value.shift();
};

// 5秒間の平均を計算
const spectralSlopeAvg = computed(() => {
  return frequencyAnalysisService.calculateAverage(spectralSlopeQueue.value);
});

const bandPeakAvg = computed(() => {
  return frequencyAnalysisService.calculateAverage(bandPeakQueue.value);
});

// テーマが変更されたときに再描画
watch(() => theme.global.current.value, () => {
  updateHeatmap();
}, { deep: true });

// データ更新
watchEffect(() => {
  updateHarmonicRatios();
});

watchEffect(() => {
  updateHeatmap();
});

// コンポーネントがマウントされたときに初期描画
onMounted(() => {
  if (heatmapCanvas.value) {
    updateHeatmap();
  }
});

// キャンバス要素が変更されたときに再描画
watch(heatmapCanvas, (canvas) => {
  if (canvas) {
    updateHeatmap();
  }
});

// ヒートマップをリセットする関数
const resetHeatmap = () => {
  console.log('ファイル分析ヒートマップをリセットします');
  
  // キューをクリア
  spectralSlopeQueue.value = [];
  bandPeakQueue.value = [];
  
  // キャンバスをクリア
  const ctx = heatmapCanvas.value?.getContext("2d");
  if (ctx) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    // 背景を黒に設定
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, width, height);
    
    // ヒートマップを更新
    updateHeatmap();
  }
  
  console.log('ファイル分析ヒートマップをリセットしました');
};

// 再生位置に合わせてスクロール位置を自動調整する関数
const adjustScrollToPlaybackTime = (playbackTime: number) => {
  if (!props.duration) return;
  
  // 再生位置が表示範囲外の場合、スクロール位置を調整
  if (playbackTime < viewStartTime.value || playbackTime > viewEndTime.value) {
    // 10秒表示の中央に再生位置が来るようにスクロール位置を調整
    // ただし、ファイルの先頭と末尾付近では中央に来ないようにする
    const halfDisplayDuration = displayDuration / 2;
    let newStartTime = playbackTime - halfDisplayDuration;
    
    // 先頭より前にならないように調整
    newStartTime = Math.max(0, newStartTime);
    
    // 末尾を超えないように調整
    if (newStartTime + displayDuration > props.duration) {
      newStartTime = Math.max(0, props.duration - displayDuration);
    }
    
    // スクロール位置を更新
    scrollPosition.value = newStartTime / props.duration;
    
    // 表示範囲を更新
    viewStartTime.value = newStartTime;
    viewEndTime.value = Math.min(props.duration, newStartTime + displayDuration);
    
    // ヒートマップを更新
    updateHeatmap();
    
    console.log(`スクロール位置を調整: ${formatTime(viewStartTime.value)} - ${formatTime(viewEndTime.value)}`);
  }
};

// 外部に公開するメソッド
defineExpose({
  resetHeatmap,
  adjustScrollToPlaybackTime
});
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
</style>