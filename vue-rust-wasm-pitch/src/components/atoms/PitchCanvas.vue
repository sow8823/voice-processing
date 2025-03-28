<template>
  <div>
    <div class="canvas-wrapper">
      <canvas ref="pitchCanvas" width="800" height="200"></canvas>
    </div>
    <v-row class="mt-2">
      <v-col cols="6">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">現在のピッチ</div>
            <div class="text-h6 font-weight-bold primary--text">{{ currentPitch.toFixed(1) }} Hz</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6">
        <v-card variant="outlined" class="pa-2">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis">音階</div>
            <div class="text-h6 font-weight-bold primary--text">{{ pitchToNote }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, watch, computed, onMounted } from "vue";
import { useTheme } from "vuetify";

const props = defineProps<{ currentPitch: number }>();
const pitchCanvas = ref<HTMLCanvasElement | null>(null);
const theme = useTheme();

// 音階変換のヘルパー関数
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const pitchToNote = computed(() => {
  if (props.currentPitch < 20) return '-';
  
  // A4 = 440Hz を基準に計算
  const a4 = 440;
  const noteNumber = 12 * (Math.log(props.currentPitch / a4) / Math.log(2));
  const roundedNoteNumber = Math.round(noteNumber);
  
  // 音階名を計算
  const octave = Math.floor((roundedNoteNumber + 9) / 12) + 4;
  const noteName = noteNames[(roundedNoteNumber + 9) % 12];
  
  return `${noteName}${octave}`;
});

// ピッチインジケーターを描画
const drawPitchIndicator = (pitch: number) => {
  const ctx = pitchCanvas.value?.getContext("2d");
  if (ctx) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    // キャンバスをクリア
    ctx.clearRect(0, 0, width, height);
    
    // 現在のテーマに基づいて色を取得
    const isDark = theme.global.current.value.dark;
    const primaryColor = theme.global.current.value.colors.primary;
    const textColor = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const bgColor = isDark ? 'rgba(30, 30, 30, 0.3)' : 'rgba(240, 240, 240, 0.3)';
    
    // 背景
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    
    // 目盛りを描画
    ctx.strokeStyle = gridColor;
    ctx.beginPath();
    for (let i = 0; i <= 2000; i += 200) {
      const tickX = (i / 2000) * width;
      ctx.moveTo(tickX, 0);
      ctx.lineTo(tickX, height);
    }
    ctx.stroke();
    
    // 目盛りのラベルを描画
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 2000; i += 200) {
      const tickX = (i / 2000) * width;
      ctx.fillText(`${i}`, tickX, height - 10);
    }
    
    // 単位を表示
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Hz', width - 10, height - 10);
    
    if (pitch > 0) {
      // ピッチマーカーを描画
      const x = (pitch / 2000) * width;
      
      // マーカーの影
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      
      // マーカーの背景円
      ctx.beginPath();
      ctx.arc(x, height / 2, 15, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();
      
      // マーカーの中心点
      ctx.beginPath();
      ctx.arc(x, height / 2, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.shadowColor = 'transparent';
      ctx.fill();
      
      // ピッチ値を表示
      ctx.fillStyle = primaryColor;
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${pitch.toFixed(1)}`, x, height / 2 - 25);
      
      // 垂直線
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.strokeStyle = `${primaryColor}80`; // 50% 透明度
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
};

// テーマが変更されたときに再描画
watch(() => theme.global.current.value, () => {
  drawPitchIndicator(props.currentPitch);
}, { deep: true });

// ピッチが変更されたときに再描画
watch(() => props.currentPitch, drawPitchIndicator, { immediate: true });

// コンポーネントがマウントされたときに初期描画
onMounted(() => {
  if (pitchCanvas.value) {
    drawPitchIndicator(props.currentPitch);
  }
});

// キャンバス要素が変更されたときに再描画
watch(pitchCanvas, (canvas) => {
  if (canvas) {
    drawPitchIndicator(props.currentPitch);
  }
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

