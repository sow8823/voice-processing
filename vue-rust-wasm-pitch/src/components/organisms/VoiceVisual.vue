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
          <v-card-title class="d-flex align-center justify-space-between">
            <div class="d-flex align-center">
              <v-icon start icon="mdi-gradient-vertical" class="mr-2"></v-icon>
              <span>周波数ヒートマップ</span>
            </div>
            <v-card class="legend-card">
              <div class="legend-gradient"></div>
              <div class="d-flex justify-space-between">
                <span class="text-caption text-white">低</span>
                <span class="text-caption text-white">高</span>
              </div>
            </v-card>
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
import { ref, onUnmounted } from "vue";
import PitchCanvas from "../atoms/PitchCanvas.vue";
import SpectrumCanvas from "../atoms/SpectrumCanvas.vue";
import { audioService, pitchDetectionService } from "../../services";
import HeatMapCanvas from "../atoms/HeatMapCanvas.vue";

const currentPitch = ref<number>(0);
const frequencyData = ref<Uint8Array>(new Uint8Array(1024));
const isProcessing = ref<boolean>(false);
const animationFrameId = ref<number | null>(null);

// 音声処理を開始する関数
const startAudio = async () => {
  if (isProcessing.value) return;
  
  isProcessing.value = true;
  
  try {
    // ピッチ検出サービスを初期化
    await pitchDetectionService.initialize();
    
    // 音声サービスを初期化
    const { audioContext } = await audioService.initialize();
    
    // FFTサイズを設定
    const bufferSize = 2048;
    audioService.setFFTSize(bufferSize);
    
    // オーディオバッファを作成
    const audioBuffer = new Float32Array(bufferSize);
    frequencyData.value = new Uint8Array(audioService.getFrequencyBinCount());
    
    // サンプリングレートを取得
    const sampleRate = audioService.getSampleRate();
    
    // 閾値の設定
    const powerThreshold = 0.0001;
    const clarityThreshold = 0.7;
    
    // 更新関数
    const update = () => {
      // 時間領域のデータを取得
      audioService.getTimeDomainData(audioBuffer);
      
      // 周波数領域のデータを取得
      audioService.getFrequencyData(frequencyData.value);
      
      // Vueのリアクティビティを維持するために新しい参照を作成
      frequencyData.value = new Uint8Array([...frequencyData.value]);
      
      // ピッチを検出
      currentPitch.value = pitchDetectionService.detectPitch(
        audioBuffer,
        sampleRate,
        { powerThreshold, clarityThreshold }
      );
      
      // アニメーションフレームを要求
      animationFrameId.value = requestAnimationFrame(update);
    };
    
    // 更新を開始
    update();
  } catch (error) {
    console.error('音声処理の開始に失敗しました:', error);
    isProcessing.value = false;
    alert('マイクへのアクセスが拒否されたか、エラーが発生しました。');
  }
};

// コンポーネントがアンマウントされたときにリソースを解放
onUnmounted(() => {
  if (animationFrameId.value !== null) {
    cancelAnimationFrame(animationFrameId.value);
  }
  
  audioService.dispose();
  pitchDetectionService.dispose();
  
  isProcessing.value = false;
});
</script>

<style scoped>
.legend-card {
  background-color: rgb(0, 0, 0) !important;
  padding: 8px;
  border-radius: 4px;
  width: 100px;
  height: fit-content;
}

.legend-gradient {
  width: 100%;
  height: 10px;
  background: linear-gradient(to right,
    rgb(0, 0, 180),
    rgb(72, 20, 255),
    rgb(247, 37, 255),
    rgb(247, 190, 111),
    rgb(247, 255, 0)
  );
  border-radius: 2px;
  margin-bottom: 4px;
}
</style>
