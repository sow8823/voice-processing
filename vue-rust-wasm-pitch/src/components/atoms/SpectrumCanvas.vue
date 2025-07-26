<template>
  <div>
    <div class="canvas-wrapper">
      <canvas ref="spectrumCanvas" :width="canvasWidth" :height="canvasHeight"></canvas>
    </div>
    <v-row class="mt-2">
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">スペクトル傾斜</div>
            <div class="text-h6 font-weight-bold secondary--text">{{ spectralSlope !== undefined ? spectralSlope.toFixed(1) : '0.0' }} dB/oct</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">声区推定</div>
            <div class="text-h6 font-weight-bold secondary--text">{{ getVoiceTypeFromSlope(spectralSlope) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">2.8kHz~3.2kHz 最大成分</div>
            <div class="text-h6 font-weight-bold secondary--text">{{ bandPeakRatio !== undefined ? bandPeakRatio.toFixed(1) : '0.0' }}%</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, watchEffect, computed, watch, onMounted } from "vue";
import { useTheme } from "vuetify";
import { frequencyAnalysisService } from "../../services";

// キャンバスサイズ
const canvasWidth = 800;
const canvasHeight = 300;

const props = defineProps<{
  frequencyData: Uint8Array;
  baseFrequency: number;
  detectedBaseFrequency?: number;
  detectedHarmonic2Frequency?: number;
  detectedHarmonic3Frequency?: number;
}>();
const spectrumCanvas = ref<HTMLCanvasElement | null>(null);
const sampleRate = 44100; // サンプリング周波数、今回は基本的な値として 44100Hz を使用
const theme = useTheme();

// 周波数特性を描画
const drawFrequencySpectrum = (frequencyData: Uint8Array) => {
  const ctx = spectrumCanvas.value?.getContext("2d");
  if (ctx) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    // キャンバスをクリア
    ctx.clearRect(0, 0, width, height);
    
    // 現在のテーマに基づいて色を取得
    const isDark = theme.global.current.value.dark;
    const primaryColor = theme.global.current.value.colors.primary;
    const secondaryColor = theme.global.current.value.colors.secondary;
    const textColor = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const bgColor = isDark ? 'rgba(30, 30, 30, 0.3)' : 'rgba(240, 240, 240, 0.3)';
    
    // 背景
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    const maxFrequency = 10000; // 最大10kHzまで表示
    const nyquist = sampleRate / 2;
    const dataLength = Math.floor((maxFrequency / nyquist) * frequencyData.length);
    const filteredData = frequencyData.slice(0, dataLength);

    // 目盛りを描画
    ctx.strokeStyle = gridColor;
    ctx.beginPath();
    for (let i = 0; i <= maxFrequency; i += 1000) {
      const x = (i / maxFrequency) * width;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();
    
    // 目盛りのラベルを描画
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= maxFrequency; i += 1000) {
      const x = (i / maxFrequency) * width;
      ctx.fillText(`${i}`, x, height - 10);
    }
    
    // 単位を表示
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Hz', width - 10, height - 10);

    // 周波数スペクトルを描画
    const barWidth = width / filteredData.length;
    const barSpacing = 0.2; // バー間のスペース（ピクセル）

    // グラデーションを作成
    const barGradient = ctx.createLinearGradient(0, height, 0, 0);
    barGradient.addColorStop(0, `${primaryColor}B3`); // 70% 透明度
    barGradient.addColorStop(0.6, `${primaryColor}CC`); // 80% 透明度
    barGradient.addColorStop(1, `${secondaryColor}E6`); // 90% 透明度
    
    // 基本周波数と倍音を強調表示するための準備
    let baseFreqX = -1;
    let harmonic2X = -1;
    let harmonic3X = -1;
    
    if (props.baseFrequency > 50) {
      const fftSize = props.frequencyData.length * 2;
      
      // 検出された基音成分と倍音成分の周波数を使用（指定されていない場合は従来の計算方法を使用）
      const baseFrequency = props.detectedBaseFrequency || props.baseFrequency;
      const harmonic2Frequency = props.detectedHarmonic2Frequency || (props.baseFrequency * 2);
      const harmonic3Frequency = props.detectedHarmonic3Frequency || (props.baseFrequency * 3);
      
      const baseIdx = getFrequencyIndex(baseFrequency, sampleRate, fftSize);
      const harmonic2Idx = getFrequencyIndex(harmonic2Frequency, sampleRate, fftSize);
      const harmonic3Idx = getFrequencyIndex(harmonic3Frequency, sampleRate, fftSize);
      
      baseFreqX = (baseIdx / filteredData.length) * width;
      harmonic2X = (harmonic2Idx / filteredData.length) * width;
      harmonic3X = (harmonic3Idx / filteredData.length) * width;
    }

    // バーを描画
    filteredData.forEach((value, index) => {
      const x = index * barWidth;
      const barHeight = (value / 255) * (height - 30); // 正規化して高さを計算（ラベル用に下部に余白を残す）
      
      // 特定の周波数を強調表示
      const isSpecialFreq =
        (Math.abs(x - baseFreqX) < barWidth * 2) ||
        (Math.abs(x - harmonic2X) < barWidth * 2) ||
        (Math.abs(x - harmonic3X) < barWidth * 2);
      
      if (isSpecialFreq) {
        // 基本周波数または倍音の場合は特別な色で描画
        ctx.fillStyle = secondaryColor;
      } else {
        ctx.fillStyle = barGradient;
      }
      
      // 角丸の長方形を描画
      const radius = 2;
      const barX = x;
      const barY = height - barHeight - 20; // 下部にラベル用の余白を確保
      const barW = barWidth - barSpacing;
      const barH = barHeight;
      
      if (barH > 0) {
        ctx.beginPath();
        ctx.moveTo(barX + radius, barY);
        ctx.lineTo(barX + barW - radius, barY);
        ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + radius);
        ctx.lineTo(barX + barW, barY + barH - radius);
        ctx.quadraticCurveTo(barX + barW, barY + barH, barX + barW - radius, barY + barH);
        ctx.lineTo(barX + radius, barY + barH);
        ctx.quadraticCurveTo(barX, barY + barH, barX, barY + barH - radius);
        ctx.lineTo(barX, barY + radius);
        ctx.quadraticCurveTo(barX, barY, barX + radius, barY);
        ctx.closePath();
        ctx.fill();
      }
    });
    
    // 基本周波数と倍音の位置にマーカーを表示
    if (props.baseFrequency > 50) {
      // 検出された周波数を表示用のラベルに追加
      const baseFrequency = props.detectedBaseFrequency || props.baseFrequency;
      const harmonic2Frequency = props.detectedHarmonic2Frequency || (props.baseFrequency * 2);
      const harmonic3Frequency = props.detectedHarmonic3Frequency || (props.baseFrequency * 3);
      
      const positions = [
        { x: baseFreqX, label: `基本 (${Math.round(baseFrequency)}Hz)` },
        { x: harmonic2X, label: `2倍音 (${Math.round(harmonic2Frequency)}Hz)` },
        { x: harmonic3X, label: `3倍音 (${Math.round(harmonic3Frequency)}Hz)` }
      ];
      
      positions.forEach(pos => {
        if (pos.x > 0 && pos.x < width) {
          // 垂直線
          ctx.beginPath();
          ctx.moveTo(pos.x, 20);
          ctx.lineTo(pos.x, height - 30);
          ctx.strokeStyle = `${secondaryColor}80`; // 50% 透明度
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // ラベル
          ctx.fillStyle = secondaryColor;
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(pos.label, pos.x, 15);
        }
      });
    }
  }
};

// 周波数インデックスの計算をサービスに委譲
const getFrequencyIndex = (freq: number, sampleRate: number, fftSize: number) => {
  return frequencyAnalysisService.getFrequencyIndex(freq, sampleRate, fftSize);
};

// 倍音分析の結果を計算
const harmonicAnalysis = computed(() => {
  // 検出された基音成分の周波数を使用（指定されていない場合は従来の計算方法を使用）
  const baseFrequency = props.detectedBaseFrequency || props.baseFrequency;
  
  return frequencyAnalysisService.analyzeHarmonics(
    props.frequencyData,
    baseFrequency,
    44100 // サンプリングレート
  );
});

// スペクトル傾斜
const spectralSlope = computed(() => {
  return harmonicAnalysis.value.spectralSlope;
});

// 特定の周波数帯域の最大成分比率
const bandPeakRatio = computed(() => {
  return harmonicAnalysis.value.bandPeakRatio;
});

// 2.5kHzから6kHzの範囲の高周波成分比率
const highFreqRatio = computed(() => {
  return harmonicAnalysis.value.highFreqRatio;
});

// 高周波成分が基音の3分の1以上あるかどうか
const hasStrongHighFreq = computed(() => {
  return highFreqRatio.value >= 33.3; // 基音の3分の1（33.3%）以上
});

// テーマが変更されたときに再描画
watch(() => theme.global.current.value, () => {
  drawFrequencySpectrum(props.frequencyData);
}, { deep: true });

// 変更を監視
watchEffect(() => {
  drawFrequencySpectrum(props.frequencyData);
});

// コンポーネントがマウントされたときに初期描画
onMounted(() => {
  if (spectrumCanvas.value) {
    drawFrequencySpectrum(props.frequencyData);
  }
});

// キャンバス要素が変更されたときに再描画
watch(spectrumCanvas, (canvas) => {
  if (canvas) {
    drawFrequencySpectrum(props.frequencyData);
  }
});

// スペクトル傾斜と高周波成分から声区を推定する関数
function getVoiceTypeFromSlope(slope: number | undefined): string {
  if (slope === undefined) return '-';
  
  // 2.5kHzから6kHzの範囲で基音に対して3分の1以上の振幅を持つかどうかをチェック
  // 高周波成分がなければ裏声と判断
  if (!hasStrongHighFreq.value) {
    return '裏声';
  }
  
  // 高周波成分がある場合はスペクトル傾斜で判断
  if (slope >= -10 && slope <= -2) {
    return '地声';
  } else if (slope > -13 && slope < -10) {
    return '中間';
  } else if (slope >= -30 && slope <= -13) {
    return '裏声';
  } else {
    return '不明';
  }
}
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
