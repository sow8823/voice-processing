<template>
  <div>
    <v-card class="mb-6">
      <v-card-title class="text-center text-h4">リアルタイムピッチ検出と周波数特性</v-card-title>
      <v-card-subtitle class="text-center">マイクを使用して音声のピッチと周波数特性をリアルタイムで分析します</v-card-subtitle>
      
      <v-card-text class="text-center">
        <v-btn
          color="primary"
          size="large"
          @click="startAudio"
          :disabled="isProcessing"
          :loading="isProcessing"
          prepend-icon="mdi-microphone"
        >
          {{ isProcessing ? '処理中...' : '音声処理を開始' }}
        </v-btn>
        
        <v-alert
          v-if="isProcessing"
          type="info"
          variant="tonal"
          class="mt-4"
          icon="mdi-record"
          title="録音中"
          text="マイクからの音声を処理しています"
        ></v-alert>
      </v-card-text>
    </v-card>

    <v-card class="mb-6">
      <v-card-title>
        <v-icon start icon="mdi-waveform" class="mr-2"></v-icon>
        ピッチ検出
      </v-card-title>
      <v-card-text>
        <PitchCanvas :currentPitch="currentPitch" />
      </v-card-text>
    </v-card>

    <v-row>
      <v-col cols="12" md="6">
        <v-card height="100%">
          <v-card-title>
            <v-icon start icon="mdi-chart-bar" class="mr-2"></v-icon>
            周波数スペクトル
          </v-card-title>
          <v-card-text>
            <SpectrumCanvas :frequencyData="frequencyData" :base-frequency="currentPitch" />
          </v-card-text>
        </v-card>
      </v-col>
      
      <v-col cols="12" md="6">
        <v-card height="100%">
          <v-card-title>
            <v-icon start icon="mdi-gradient-vertical" class="mr-2"></v-icon>
            周波数ヒートマップ
          </v-card-title>
          <v-card-text>
            <HeatMapCanvas :frequencyData="frequencyData" :base-frequency="currentPitch" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
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
const isProcessing = ref<boolean>(false);

const startAudio = async () => {
  if (isProcessing.value) return;
  
  isProcessing.value = true;
  
  try {
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

      requestAnimationFrame(update);
    };

    update();
  } catch (error) {
    console.error('音声処理の開始に失敗しました:', error);
    isProcessing.value = false;
    alert('マイクへのアクセスが拒否されたか、エラーが発生しました。');
  }
};
</script>
