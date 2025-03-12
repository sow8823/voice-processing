<template>
  <canvas ref="pitchCanvas" width="800" height="200"></canvas>
  <p>現在のピッチ: {{ currentPitch }} Hz</p>
</template>

<script setup lang="ts">
import { ref, defineProps, watch } from "vue";

const props = defineProps<{ currentPitch: number }>();
const pitchCanvas = ref<HTMLCanvasElement | null>(null);

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
watch(() => props.currentPitch, drawPitchIndicator);

</script>

<style>
canvas {
  border: 1px solid black;
  margin-bottom: 20px;
}
</style>

