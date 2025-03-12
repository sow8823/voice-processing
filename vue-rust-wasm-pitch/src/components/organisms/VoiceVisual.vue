<template>
  <div>
    <h1>リアルタイムピッチ検出と周波数特性</h1>
    <button @click="startAudio">音声処理を開始</button>
    <PitchCanvas :currentPitch="currentPitch" />
    <SpectrumCanvas :frequencyData="frequencyData" :base-frequency="currentPitch" />
    <HeatMapCanvas :frequencyData="frequencyData" :base-frequency="currentPitch" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import init, { McLeodPitchDetector } from "../../wasm/pitch_detection";
import PitchCanvas from "../atoms/PitchCanvas.vue";
import SpectrumCanvas from "../atoms/SpectrumCanvas.vue";
import HeatMapCanvas from "../atoms/HeatMapCanvas.vue";

const currentPitch = ref<number>(0);
const frequencyData = ref<Uint8Array>(new Uint8Array(1024));

const startAudio = async () => {
  await init();
  const audioContext = new (window.AudioContext || window.AudioContext)();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioContext.createMediaStreamSource(stream);

  // ピッチ検出器を初期化
  const bufferSize = 2048;
  const padding = bufferSize / 2;
  const sampleRate = audioContext.sampleRate;
  const powerThreshold = 0.0001;
  const clarityThreshold = 0.7;
  const detector = new McLeodPitchDetector(bufferSize, padding);

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = bufferSize;
  analyser.minDecibels = -90;
  analyser.smoothingTimeConstant = 0.85;

  const audioBuffer = new Float32Array(bufferSize);
  frequencyData.value = new Uint8Array(analyser.frequencyBinCount);
  source.connect(analyser);

  // 振幅のエネルギー（RMS）計算関数
  const calculateRMS = (buffer: Float32Array): number => {
    const sumSquares = buffer.reduce((sum, value) => sum + value * value, 0);
    return Math.sqrt(sumSquares / buffer.length);
  };

  const update = () => {
    analyser.getFloatTimeDomainData(audioBuffer);
    analyser.getByteFrequencyData(frequencyData.value);

    frequencyData.value = new Uint8Array([...frequencyData.value]); // Vueのwatchがバイナリデータの変更を検知出来ないため、参照を変える
    // 振幅（エネルギー）の計算
    const amplitude = calculateRMS(audioBuffer);

    if (amplitude < powerThreshold) {
      currentPitch.value = 0;
    } else {
      // ピッチ検出
      const pitch = detector.detect_pitch(audioBuffer, sampleRate, powerThreshold, clarityThreshold);
      currentPitch.value = pitch || 0;
    }

    // const pitch = detector.detect_pitch(audioBuffer, 44100, 0.0001, 0.7);
    // currentPitch.value = pitch || 0;

    requestAnimationFrame(update);
  };

  update();
};
</script>

<style>
canvas {
  border: 1px solid black;
}
</style>
