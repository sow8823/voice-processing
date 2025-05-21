<template>
  <div>
    <div class="canvas-wrapper position-relative">
      <canvas ref="heatmapCanvas" :width="heatmapWidth" :height="heatmapHeight"></canvas>
    </div>
    
    <v-row class="mt-2">
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">2倍音強度平均</div>
            <div class="text-h6 font-weight-bold accent--text">{{ harmonic2Avg.toFixed(1) }}%</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">3倍音強度平均</div>
            <div class="text-h6 font-weight-bold accent--text">{{ harmonic3Avg.toFixed(1) }}%</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">2.8kHz~3.2kHz 最大成分平均</div>
            <div class="text-h6 font-weight-bold accent--text">{{ bandPeakAvg.toFixed(1) }}%</div>
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

const props = defineProps<{ frequencyData: Uint8Array; baseFrequency: number }>();

const heatmapCanvas = ref<HTMLCanvasElement | null>(null);
const sampleRate = 44100; // サンプリング周波数、今回は基本的な値として 44100Hz を使用
const theme = useTheme();

const heatmapWidth = 800;
const heatmapHeight = 300;

// ヒートマップ用データを動的に管理（x軸が時間、y軸が周波数）
const heatmapBuffer: Uint8Array[] = Array.from({ length: heatmapWidth }, () => new Uint8Array(heatmapHeight));
let currentColumn = 0; // ヒートマップの現在列

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

const updateHeatmap = (frequencyData: Uint8Array) => {
  const ctx = heatmapCanvas.value?.getContext("2d");
  if (ctx) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    ctx.clearRect(0, 0, width, height);

    // 背景を黒に設定
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, width, height);

    const maxFrequency = 10000;
    const nyquist = sampleRate / 2;
    const dataLength = Math.floor((maxFrequency / nyquist) * frequencyData.length);
    const filteredData = frequencyData.slice(0, dataLength);

    // filteredData をヒートマップの高さに合わせてスケール（y軸が周波数になるため）
    const scaledFilteredData = frequencyAnalysisService.scaleFrequencyData(
      filteredData,
      heatmapHeight,
      maxFrequency,
      sampleRate
    );

    // 現在の列にデータを追加
    for (let y = 0; y < heatmapHeight; y++) {
      heatmapBuffer[currentColumn][y] = scaledFilteredData[y];
    }
    
    // 次の列に進む
    currentColumn = (currentColumn + 1) % width;
    
    // 右端に達したらスクロールを開始
    if (currentColumn === 0) {
      // 右端に達したら左端に戻る代わりに、スクロールを開始
      currentColumn = width - 1;
      
      // 全体を左にシフト
      for (let x = 0; x < width - 1; x++) {
        for (let y = 0; y < heatmapHeight; y++) {
          heatmapBuffer[x][y] = heatmapBuffer[x + 1][y];
        }
      }
      
      // 右端の列をクリア
      for (let y = 0; y < heatmapHeight; y++) {
        heatmapBuffer[width - 1][y] = 0;
      }
    }

    // ピクセルごとの色を設定
    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 現在のバッファから直接値を取得
        const value = heatmapBuffer[x][y];
        
        const [r, g, b, a] = getColor(value);
        const index = (y * width + x) * 4;

        imageData.data[index] = r;     // R
        imageData.data[index + 1] = g; // G
        imageData.data[index + 2] = b; // B
        imageData.data[index + 3] = a; // A
      }
    }

    // ヒートマップを描画
    ctx.putImageData(imageData, 0, 0);
    
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
    
    // 基本周波数と倍音の位置にマーカーを表示
    if (props.baseFrequency > 50) {
      const fftSize = props.frequencyData.length * 2;
      const baseIdx = getFrequencyIndex(props.baseFrequency, sampleRate, fftSize);
      // 周波数を反転（低周波数が下、高周波数が上）
      const baseY = height - (baseIdx / filteredData.length) * height;
      
      if (baseY > 0 && baseY < height) {
        // 基本周波数の位置に三角形のマーカーを描画
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.moveTo(0, baseY - 5);
        ctx.lineTo(0, baseY + 5);
        ctx.lineTo(10, baseY);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
};

// 比率を記録するキュー（過去5秒分を保存）
const harmonic2Queue = ref<number[]>([]);
const harmonic3Queue = ref<number[]>([]);
const bandPeakQueue = ref<number[]>([]);

const maxQueueSize = heatmapWidth; // ヒートマップの列数（約5秒分）

// 倍音比率の計算
const getFrequencyIndex = (freq: number, sampleRate: number, fftSize: number) => {
  return frequencyAnalysisService.getFrequencyIndex(freq, sampleRate, fftSize);
};

const updateHarmonicRatios = () => {
  if (!props.baseFrequency || props.baseFrequency < 50) return;

  const fftSize = props.frequencyData.length * 2;
  const baseIdx = getFrequencyIndex(props.baseFrequency, sampleRate, fftSize);
  const harmonic2Idx = getFrequencyIndex(props.baseFrequency * 2, sampleRate, fftSize);
  const harmonic3Idx = getFrequencyIndex(props.baseFrequency * 3, sampleRate, fftSize);

  if (harmonic2Idx >= props.frequencyData.length || harmonic3Idx >= props.frequencyData.length) return;

  const baseAmp = props.frequencyData[baseIdx] || 1;
  const harmonic2Amp = props.frequencyData[harmonic2Idx] || 0;
  const harmonic3Amp = props.frequencyData[harmonic3Idx] || 0;

  // 2倍音・3倍音比率をキューに保存
  const harmonic2Ratio = (harmonic2Amp / baseAmp) * 100;
  const harmonic3Ratio = (harmonic3Amp / baseAmp) * 100;

  harmonic2Queue.value.push(harmonic2Ratio);
  harmonic3Queue.value.push(harmonic3Ratio);

  if (harmonic2Queue.value.length > maxQueueSize) harmonic2Queue.value.shift();
  if (harmonic3Queue.value.length > maxQueueSize) harmonic3Queue.value.shift();

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
const harmonic2Avg = computed(() => {
  return frequencyAnalysisService.calculateAverage(harmonic2Queue.value);
});

const harmonic3Avg = computed(() => {
  return frequencyAnalysisService.calculateAverage(harmonic3Queue.value);
});

const bandPeakAvg = computed(() => {
  return frequencyAnalysisService.calculateAverage(bandPeakQueue.value);
});

// テーマが変更されたときに再描画
watch(() => theme.global.current.value, () => {
  updateHeatmap(props.frequencyData);
}, { deep: true });

// データ更新
watchEffect(() => {
  updateHarmonicRatios();
});

watchEffect(() => {
  updateHeatmap(props.frequencyData);
});

// コンポーネントがマウントされたときに初期描画
onMounted(() => {
  if (heatmapCanvas.value) {
    updateHeatmap(props.frequencyData);
  }
});

// キャンバス要素が変更されたときに再描画
watch(heatmapCanvas, (canvas) => {
  if (canvas) {
    updateHeatmap(props.frequencyData);
  }
});

// ヒートマップをリセットする関数
const resetHeatmap = () => {
  console.log('ヒートマップをリセットします');
  
  // ヒートマップバッファをクリア
  for (let i = 0; i < heatmapWidth; i++) {
    heatmapBuffer[i].fill(0);
  }
  
  // 現在の列をリセット
  currentColumn = 0;
  
  // キューをクリア
  harmonic2Queue.value = [];
  harmonic3Queue.value = [];
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
    
    // 目盛りを再描画
    drawScales(ctx, width, height);
  }
  
  console.log('ヒートマップをリセットしました');
};

// 目盛りを描画する関数
const drawScales = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
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

// 外部に公開するメソッド
defineExpose({
  resetHeatmap
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
