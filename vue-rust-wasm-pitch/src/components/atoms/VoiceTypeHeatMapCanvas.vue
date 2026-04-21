<template>
  <div class="heatmap-container">
    <div class="canvas-wrapper position-relative">
      <canvas
        ref="heatmapCanvas"
        :width="heatmapWidth"
        :height="heatmapHeight"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseLeave"
        style="cursor: crosshair;"
      ></canvas>
      <!-- 凡例 -->
      <div class="segment-legend mt-1">
        <span v-for="seg in segments" :key="seg.id" class="legend-item">
          <span class="legend-color" :style="{ background: seg.color }"></span>
          {{ seg.label }}
          <span v-if="seg.start !== null && seg.end !== null" class="text-caption ml-1">
            ({{ formatTime(seg.start) }} - {{ formatTime(seg.end) }})
          </span>
        </span>
      </div>
    </div>

    <!-- スクロールコントロール（10秒超の場合） -->
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

    <!-- セグメント指定ガイド -->
    <v-card variant="outlined" class="mt-3 pa-3">
      <div class="text-subtitle-2 mb-2">
        <v-icon size="small" class="mr-1">mdi-gesture-tap-hold</v-icon>
        ヒートマップ上でドラッグして各音程の範囲を指定してください
      </div>
      <v-row dense>
        <v-col v-for="seg in segments" :key="seg.id" cols="12" sm="4">
          <v-card
            :color="activeSegment === seg.id ? seg.color : undefined"
            :variant="activeSegment === seg.id ? 'tonal' : 'outlined'"
            class="pa-2 segment-card"
            @click="selectSegment(seg.id)"
            style="cursor: pointer;"
          >
            <div class="d-flex align-center">
              <span class="legend-color mr-2" :style="{ background: seg.color }"></span>
              <div>
                <div class="text-body-2 font-weight-bold">{{ seg.label }}</div>
                <div class="text-caption">
                  <span v-if="seg.start !== null && seg.end !== null">
                    {{ formatTime(seg.start) }} ～ {{ formatTime(seg.end) }}
                  </span>
                  <span v-else class="text-medium-emphasis">未設定</span>
                </div>
              </div>
              <v-spacer />
              <v-btn
                v-if="seg.start !== null"
                icon="mdi-close"
                size="x-small"
                variant="text"
                @click.stop="clearSegment(seg.id)"
              ></v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, watchEffect } from 'vue';
import { frequencyAnalysisService } from '../../services';

export interface TimeSegment {
  id: 'low' | 'mid' | 'high';
  label: string;
  color: string;
  start: number | null;
  end: number | null;
}

const props = defineProps<{
  analysisData: {
    frequencyData: Uint8Array[];
    timestamps: number[];
  };
  duration?: number;
  pitchLabels?: { low: string; mid: string; high: string };
}>();

const emit = defineEmits<{
  (e: 'segments-updated', segments: TimeSegment[]): void;
}>();

const heatmapCanvas = ref<HTMLCanvasElement | null>(null);
const sampleRate = 44100;

const heatmapWidth = 800;
const heatmapHeight = 300;

const displayDuration = 10;
const scrollPosition = ref<number>(0);
const viewStartTime = ref<number>(0);
const viewEndTime = ref<number>(displayDuration);
const totalDuration = ref<number>(displayDuration);

const maxScrollPosition = computed(() => {
  if (!props.duration) return 0;
  return Math.max(0, (props.duration - displayDuration) / props.duration);
});

// セグメント定義
const segments = ref<TimeSegment[]>([
  { id: 'low', label: props.pitchLabels?.low ?? '低音', color: 'rgba(100, 180, 255, 0.7)', start: null, end: null },
  { id: 'mid', label: props.pitchLabels?.mid ?? '中音', color: 'rgba(100, 255, 150, 0.7)', start: null, end: null },
  { id: 'high', label: props.pitchLabels?.high ?? '高音', color: 'rgba(255, 160, 80, 0.7)', start: null, end: null },
]);

// pitchLabels が変わったらラベルを更新
watch(() => props.pitchLabels, (labels) => {
  if (labels) {
    segments.value[0].label = labels.low;
    segments.value[1].label = labels.mid;
    segments.value[2].label = labels.high;
  }
});

// 現在選択中のセグメント
const activeSegment = ref<'low' | 'mid' | 'high'>('low');

// ドラッグ状態
const isDragging = ref(false);
const dragStartX = ref(0);

const selectSegment = (id: 'low' | 'mid' | 'high') => {
  activeSegment.value = id;
};

const clearSegment = (id: 'low' | 'mid' | 'high') => {
  const seg = segments.value.find(s => s.id === id);
  if (seg) {
    seg.start = null;
    seg.end = null;
    drawHeatmap();
    emit('segments-updated', [...segments.value]);
  }
};

// X座標から時間（秒）に変換
const xToTime = (x: number): number => {
  const canvas = heatmapCanvas.value;
  if (!canvas) return 0;
  const rect = canvas.getBoundingClientRect();
  const scaleX = heatmapWidth / rect.width;
  const canvasX = x * scaleX;
  const displayTimeRange = viewEndTime.value - viewStartTime.value;
  return viewStartTime.value + (canvasX / heatmapWidth) * displayTimeRange;
};

const onMouseDown = (e: MouseEvent) => {
  const canvas = heatmapCanvas.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  isDragging.value = true;
  dragStartX.value = e.clientX - rect.left;

  const t = xToTime(dragStartX.value);
  const seg = segments.value.find(s => s.id === activeSegment.value);
  if (seg) {
    seg.start = t;
    seg.end = t;
  }
};

const onMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  const canvas = heatmapCanvas.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const currentX = e.clientX - rect.left;
  const t = xToTime(currentX);
  const seg = segments.value.find(s => s.id === activeSegment.value);
  if (seg && seg.start !== null) {
    const startT = xToTime(dragStartX.value);
    seg.start = Math.min(startT, t);
    seg.end = Math.max(startT, t);
    drawHeatmap();
  }
};

const onMouseUp = () => {
  if (isDragging.value) {
    isDragging.value = false;
    emit('segments-updated', [...segments.value]);
    // 次のセグメントへ自動移動
    const order: Array<'low' | 'mid' | 'high'> = ['low', 'mid', 'high'];
    const idx = order.indexOf(activeSegment.value);
    if (idx < order.length - 1) {
      activeSegment.value = order[idx + 1];
    }
  }
};

const onMouseLeave = () => {
  if (isDragging.value) {
    isDragging.value = false;
    emit('segments-updated', [...segments.value]);
  }
};

const handleScroll = (value: number) => {
  if (!props.duration) return;
  viewStartTime.value = value * props.duration;
  viewEndTime.value = Math.min(props.duration, viewStartTime.value + displayDuration);
  totalDuration.value = props.duration;
  drawHeatmap();
};

const formatTime = (seconds: number): string => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

// カラーマップ
const getColor = (value: number): [number, number, number, number] => {
  const normalizedValue = value / 255;
  if (value === 0) return [0, 0, 0, 255];
  if (normalizedValue < 0.25) {
    const t = normalizedValue / 0.25;
    return [Math.round(72 * t), Math.round(20 * t), Math.round(180 + 75 * t), 255];
  } else if (normalizedValue < 0.5) {
    const t = (normalizedValue - 0.25) / 0.25;
    return [Math.round(72 + 175 * t), Math.round(20 + 17 * t), 255, 255];
  } else if (normalizedValue < 0.75) {
    const t = (normalizedValue - 0.5) / 0.25;
    return [247, Math.round(37 + 153 * t), Math.round(255 - 144 * t), 255];
  } else {
    const t = (normalizedValue - 0.75) / 0.25;
    return [247, Math.round(190 + 65 * t), Math.round(111 - 111 * t), 255];
  }
};

const drawHeatmap = () => {
  if (!props.analysisData || !props.duration) return;
  const ctx = heatmapCanvas.value?.getContext('2d');
  if (!ctx) return;

  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.fillRect(0, 0, width, height);

  const maxFrequency = 10000;
  const nyquist = sampleRate / 2;
  const imageData = ctx.createImageData(width, height);

  const { frequencyData, timestamps } = props.analysisData;

  totalDuration.value = props.duration;
  if (props.duration > displayDuration) {
    viewStartTime.value = scrollPosition.value * props.duration;
    viewEndTime.value = Math.min(props.duration, viewStartTime.value + displayDuration);
  } else {
    viewStartTime.value = 0;
    viewEndTime.value = displayDuration;
  }

  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = 0;
    imageData.data[i + 1] = 0;
    imageData.data[i + 2] = 0;
    imageData.data[i + 3] = 255;
  }

  const displayTimeRange = viewEndTime.value - viewStartTime.value;
  const timeResolution = width / displayTimeRange;

  for (let frameIndex = 0; frameIndex < frequencyData.length; frameIndex++) {
    const frameTime = timestamps[frameIndex];
    if (frameTime >= viewStartTime.value && frameTime <= viewEndTime.value) {
      const relativeTime = frameTime - viewStartTime.value;
      const x = Math.floor(relativeTime * timeResolution);
      if (x >= 0 && x < width) {
        const frameData = frequencyData[frameIndex];
        const dataLength = Math.floor((maxFrequency / nyquist) * frameData.length);
        const filteredData = frameData.slice(0, dataLength);
        const scaledData = frequencyAnalysisService.scaleFrequencyData(filteredData, height, maxFrequency, sampleRate);
        for (let y = 0; y < height; y++) {
          const value = scaledData[y];
          const [r, g, b, a] = getColor(value);
          const index = (y * width + x) * 4;
          if (index >= 0 && index < imageData.data.length - 3) {
            imageData.data[index] = r;
            imageData.data[index + 1] = g;
            imageData.data[index + 2] = b;
            imageData.data[index + 3] = a;
          }
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // 周波数目盛り（y軸）
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 10000; i += 1000) {
    const y = height - (i / 10000) * height;
    ctx.fillText(`${i / 1000}k`, 25, y);
  }

  // 時間軸目盛り（x軸）
  ctx.textAlign = 'center';
  const secondStep = 1;
  for (let t = 0; t <= displayDuration; t += secondStep) {
    const x = Math.floor(t * timeResolution);
    if (x >= 0 && x < width) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - 20);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(`${Math.floor(viewStartTime.value) + t}s`, x, height - 5);
    }
  }

  // ファイル終了位置
  if (props.duration && props.duration < displayDuration) {
    const fileEndX = Math.floor(props.duration * timeResolution);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fileEndX, 0);
    ctx.lineTo(fileEndX, height);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('ファイル終了', fileEndX, 15);
  }

  // セグメントのオーバーレイを描画
  for (const seg of segments.value) {
    if (seg.start === null || seg.end === null) continue;
    const startInView = seg.start - viewStartTime.value;
    const endInView = seg.end - viewStartTime.value;
    const x1 = Math.floor(startInView * timeResolution);
    const x2 = Math.floor(endInView * timeResolution);
    if (x2 < 0 || x1 > width) continue;
    const clampedX1 = Math.max(0, x1);
    const clampedX2 = Math.min(width, x2);

    // 半透明の塗りつぶし
    ctx.fillStyle = seg.color.replace('0.7', '0.25');
    ctx.fillRect(clampedX1, 0, clampedX2 - clampedX1, height);

    // 境界線
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(clampedX1, 0);
    ctx.lineTo(clampedX1, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(clampedX2, 0);
    ctx.lineTo(clampedX2, height);
    ctx.stroke();

    // ラベル
    ctx.fillStyle = seg.color;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    const labelX = Math.max(clampedX1, Math.min(clampedX2, (clampedX1 + clampedX2) / 2));
    ctx.fillText(seg.label, labelX, 20);
  }

  // アクティブセグメントのハイライト（ドラッグ中）
  if (isDragging.value) {
    const activeSeg = segments.value.find(s => s.id === activeSegment.value);
    if (activeSeg && activeSeg.start !== null && activeSeg.end !== null) {
      const x1 = Math.floor((activeSeg.start - viewStartTime.value) * timeResolution);
      const x2 = Math.floor((activeSeg.end - viewStartTime.value) * timeResolution);
      ctx.strokeStyle = activeSeg.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(Math.max(0, x1), 0, Math.min(width, x2) - Math.max(0, x1), height);
      ctx.setLineDash([]);
    }
  }
};

// セグメントをリセット
const resetSegments = () => {
  segments.value.forEach(seg => {
    seg.start = null;
    seg.end = null;
  });
  drawHeatmap();
  emit('segments-updated', [...segments.value]);
};

watchEffect(() => {
  drawHeatmap();
});

onMounted(() => {
  if (heatmapCanvas.value) {
    drawHeatmap();
  }
});

watch(heatmapCanvas, (canvas) => {
  if (canvas) drawHeatmap();
});

defineExpose({ resetSegments });
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

.segment-legend {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 4px 0;
}

.legend-item {
  display: flex;
  align-items: center;
  font-size: 12px;
  gap: 4px;
}

.legend-color {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
}

.segment-card {
  transition: all 0.2s;
}
</style>
