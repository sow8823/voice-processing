<template>
  <div>
    <v-tabs v-model="activeTab" class="mb-6">
      <v-tab value="microphone">
        <v-icon start>mdi-microphone</v-icon>
        マイク入力
      </v-tab>
      <v-tab value="file">
        <v-icon start>mdi-file-music</v-icon>
        ファイル入力
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <!-- マイク入力タブ -->
      <v-window-item value="microphone">
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
      </v-window-item>

      <!-- ファイル入力タブ -->
      <v-window-item value="file">
        <AudioFileUploader
          @audio-loaded="handleAudioFileLoaded"
          @analysis-requested="analyzeAudioFile"
          @playback-ended="handlePlaybackEnded"
        />
      </v-window-item>
    </v-window>

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
import AudioFileUploader from "../molecules/AudioFileUploader.vue";
const activeTab = ref<string>("microphone");
const currentPitch = ref<number>(0);
const frequencyData = ref<Uint8Array>(new Uint8Array(1024));
const isProcessing = ref<boolean>(false);
const animationFrameId = ref<number | null>(null);
const fileAudioBuffer = ref<AudioBuffer | null>(null);

// 音声処理を開始する関数
const startAudio = async () => {
  if (isProcessing.value) return;
  
  isProcessing.value = true;
  
  try {
    // ピッチ検出サービスを初期化
    await pitchDetectionService.initialize();
    
    // 音声サービスを初期化
    await audioService.initialize();
    
    // FFTサイズを設定
    const bufferSize = 2048;
    audioService.setFFTSize(bufferSize);
    
    // オーディオバッファを作成
    const audioBuffer = new Float32Array(bufferSize);
    frequencyData.value = new Uint8Array(audioService.getFrequencyBinCount());
    
    // サンプリングレートを取得
    const sampleRate = audioService.getSampleRate();
    
    // 閾値の設定
    const powerThreshold = 0.001;
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

// ファイルがアップロードされたときの処理
const handleAudioFileLoaded = (audioBuffer: AudioBuffer) => {
  fileAudioBuffer.value = audioBuffer;
  console.log('音声ファイルが読み込まれました:', audioBuffer);
};

// ファイルの分析リクエストがあったときの処理
const analyzeAudioFile = async (audioBuffer: AudioBuffer) => {
  if (!audioBuffer) {
    console.error('音声バッファが空です');
    return;
  }
  
  console.log('音声ファイルの分析を開始します', {
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels
  });
  
  try {
    // ピッチ検出サービスを初期化
    await pitchDetectionService.initialize();
    console.log('ピッチ検出サービスを初期化しました');
    
    // バッファサイズを設定
    const bufferSize = 2048;
    
    // 既存のアニメーションフレームをクリア
    if (animationFrameId.value !== null) {
      cancelAnimationFrame(animationFrameId.value);
      animationFrameId.value = null;
    }
    
    // AudioServiceにファイルバッファを設定
    try {
      audioService.setAudioFileBuffer(audioBuffer);
      console.log('AudioServiceにファイルバッファを設定しました');
    } catch (error) {
      console.error('ファイルバッファの設定に失敗しました:', error);
      throw error;
    }
    
    // FFTサイズを設定
    audioService.setFFTSize(bufferSize);
    
    // 周波数データ用の配列を初期化
    const frequencyBinCount = audioService.getFrequencyBinCount();
    console.log(`周波数ビン数: ${frequencyBinCount}`);
    frequencyData.value = new Uint8Array(frequencyBinCount);
    
    // サンプリングレートを取得
    const sampleRate = audioService.getSampleRate();
    console.log(`サンプリングレート: ${sampleRate}Hz`);
    
    // 閾値の設定
    const powerThreshold = 0.001;
    const clarityThreshold = 0.7;
    
    // 分析用の一時バッファ
    const tempBuffer = new Float32Array(bufferSize);
    
    // 音声ファイルの再生を開始
    try {
      audioService.startAudioFile();
      console.log('音声ファイルの再生を開始しました');
    } catch (error) {
      console.error('音声ファイルの再生開始に失敗しました:', error);
      throw error;
    }
    
    // 分析関数
    const analyzeFrame = () => {
      try {
        // 時間領域のデータを取得
        audioService.getTimeDomainData(tempBuffer);
        
        // 周波数領域のデータを取得
        audioService.getFrequencyData(frequencyData.value);
        
        // Vueのリアクティビティを維持するために新しい参照を作成
        frequencyData.value = new Uint8Array([...frequencyData.value]);
        
        // ピッチを検出
        currentPitch.value = pitchDetectionService.detectPitch(
          tempBuffer,
          sampleRate,
          { powerThreshold, clarityThreshold }
        );
        
        // 次のフレームをスケジュール
        animationFrameId.value = requestAnimationFrame(analyzeFrame);
      } catch (frameError) {
        console.error('フレーム分析中にエラーが発生しました:', frameError);
        if (animationFrameId.value !== null) {
          cancelAnimationFrame(animationFrameId.value);
          animationFrameId.value = null;
        }
      }
    };
    
    // 分析を開始
    console.log('分析を開始します');
    analyzeFrame();
  } catch (error) {
    console.error('音声ファイルの分析に失敗しました:', error);
    alert('音声ファイルの分析に失敗しました。');
    
    // エラーが発生した場合、アニメーションフレームをクリア
    if (animationFrameId.value !== null) {
      cancelAnimationFrame(animationFrameId.value);
      animationFrameId.value = null;
    }
  }
};

// 再生終了時の処理
const handlePlaybackEnded = () => {
  console.log('再生が終了しました');
  
  // アニメーションフレームをキャンセル
  if (animationFrameId.value !== null) {
    console.log('アニメーションフレームをキャンセルします');
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
  
  // ピッチと周波数データをリセット
  currentPitch.value = 0;
  frequencyData.value = new Uint8Array(frequencyData.value.length);
  
  console.log('分析データをリセットしました');
};
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
