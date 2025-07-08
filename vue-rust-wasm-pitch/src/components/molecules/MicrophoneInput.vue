<template>
  <div class="microphone-input">
    <v-card class="mb-6">
      <v-card-title class="text-center text-h5">
        <v-icon start icon="mdi-microphone" class="mr-2"></v-icon>
        リアルタイムピッチ検出と周波数特性
      </v-card-title>
      <v-card-subtitle class="text-center">
        マイクを使用して音声のピッチと周波数特性をリアルタイムで分析します
      </v-card-subtitle>
      
      <v-card-text class="text-center">
        <v-btn
          :color="isProcessing ? 'error' : 'primary'"
          size="large"
          @click="toggleAudio"
          :loading="isLoading"
          :prepend-icon="isProcessing ? 'mdi-stop' : 'mdi-microphone'"
        >
          {{ isProcessing ? '音声処理を終了' : '音声処理を開始' }}
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
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { audioService, pitchDetectionService } from "../../services";

// イベント
const emit = defineEmits<{
  (e: 'pitch-detected', pitch: number): void;
  (e: 'frequency-data-updated', frequencyData: Uint8Array): void;
  (e: 'processing-state-changed', isProcessing: boolean): void;
}>();

// リアクティブな状態
const isProcessing = ref<boolean>(false);
const isLoading = ref<boolean>(false);
const animationFrameId = ref<number | null>(null);

// マイク入力の処理を開始/停止する関数
const toggleAudio = async () => {
  if (isProcessing.value) {
    stopAudio();
  } else {
    startAudio();
  }
};

// マイク入力の処理を開始する関数
const startAudio = async () => {
  isLoading.value = true;
  
  try {
    // AudioContextとAnalyserNodeを初期化
    await audioService.initialize();
    
    // FFTサイズを設定（2048は一般的な値）
    audioService.setFFTSize(2048);
    
    // ピッチ検出サービスを初期化
    await pitchDetectionService.initialize();
    
    // 処理を開始
    isProcessing.value = true;
    emit('processing-state-changed', true);
    
    // アニメーションフレームを開始
    updatePitch();
  } catch (error) {
    console.error('マイク入力の初期化に失敗しました:', error);
    alert('マイクへのアクセスに失敗しました。ブラウザの設定を確認してください。');
  } finally {
    isLoading.value = false;
  }
};

// マイク入力の処理を停止する関数
const stopAudio = () => {
  // アニメーションフレームを停止
  if (animationFrameId.value !== null) {
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
  
  // マイク入力を停止（リソースを解放）
  audioService.dispose();
  
  // 状態を更新
  isProcessing.value = false;
  emit('processing-state-changed', false);
};

// ピッチ検出と周波数データの更新を行う関数
const updatePitch = () => {
  if (!isProcessing.value) return;
  
  // 周波数データを取得
  const frequencyBinCount = audioService.getFrequencyBinCount();
  const frequencyData = new Uint8Array(frequencyBinCount);
  audioService.getFrequencyData(frequencyData);
  
  // 時間領域データを取得（ピッチ検出用）
  const bufferSize = 2048; // FFTサイズと同じ値を使用
  const audioBuffer = new Float32Array(bufferSize);
  audioService.getTimeDomainData(audioBuffer);
  
  // ピッチを検出
  const pitch = pitchDetectionService.detectPitch(
    audioBuffer,
    audioService.getSampleRate()
  );
  
  // 検出結果を親コンポーネントに通知
  emit('pitch-detected', pitch);
  
  // 周波数データを親コンポーネントに通知
  emit('frequency-data-updated', frequencyData);
  
  // 次のフレームをリクエスト
  animationFrameId.value = requestAnimationFrame(updatePitch);
};

// コンポーネントがアンマウントされたときのクリーンアップ
onUnmounted(() => {
  // 処理中なら停止
  if (isProcessing.value) {
    stopAudio();
  }
});
</script>

<style scoped>
.microphone-input {
  width: 100%;
}
</style>