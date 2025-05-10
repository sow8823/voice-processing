<template>
  <div class="audio-file-uploader">
    <v-card class="mb-6">
      <v-card-title class="text-center text-h5">
        <v-icon start icon="mdi-file-upload" class="mr-2"></v-icon>
        音声ファイルのアップロード
      </v-card-title>
      <v-card-subtitle class="text-center">
        MP3またはWAVファイルをアップロードして分析します
      </v-card-subtitle>
      
      <v-card-text>
        <v-file-input
          v-model="audioFile"
          accept="audio/mp3,audio/wav"
          label="音声ファイルを選択"
          prepend-icon="mdi-music"
          show-size
          :rules="[rules.required, rules.fileType]"
          @update:model-value="handleFileChange"
        ></v-file-input>
        
        <div v-if="audioUrl" class="audio-player-container">
          <v-card variant="outlined" class="pa-4">
            <div class="d-flex align-center mb-2">
              <v-icon icon="mdi-music-note" class="mr-2"></v-icon>
              <span class="text-subtitle-1">{{ audioFile?.name }}</span>
            </div>
            
            <audio
              ref="audioPlayer"
              controls
              class="w-100"
              :src="audioUrl"
              @loadedmetadata="handleAudioLoaded"
            ></audio>
            
            <div class="d-flex justify-space-between align-center mt-4">
              <v-btn
                color="primary"
                variant="outlined"
                prepend-icon="mdi-play"
                @click="playAudio"
                :disabled="!audioUrl"
              >
                再生
              </v-btn>
              
              <v-btn
                color="error"
                variant="outlined"
                prepend-icon="mdi-delete"
                @click="clearAudio"
                :disabled="!audioUrl"
              >
                クリア
              </v-btn>
              
              <v-btn
                color="success"
                prepend-icon="mdi-waveform"
                @click="analyzeAudio"
                :disabled="!audioUrl || isAnalyzing"
                :loading="isAnalyzing"
              >
                分析
              </v-btn>
            </div>
          </v-card>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';

// イベント
const emit = defineEmits<{
  (e: 'audio-loaded', audioBuffer: AudioBuffer): void;
  (e: 'analysis-requested', audioBuffer: AudioBuffer): void;
}>();

// リアクティブな状態
const audioFile = ref<File | null>(null);
const audioUrl = ref<string | null>(null);
const audioPlayer = ref<HTMLAudioElement | null>(null);
const audioContext = ref<AudioContext | null>(null);
const audioBuffer = ref<AudioBuffer | null>(null);
const isAnalyzing = ref<boolean>(false);

// バリデーションルール
const rules = {
  required: (value: File | null) => !!value || 'ファイルを選択してください',
  fileType: (value: File | null) => {
    if (!value) return true;
    const allowedTypes = ['audio/mp3', 'audio/wav', 'audio/mpeg'];
    return allowedTypes.includes(value.type) || 'MP3またはWAVファイルのみ対応しています';
  }
};

// ファイル選択時の処理
const handleFileChange = async (files: File | File[] | null) => {
  const file = files instanceof Array ? files[0] : files;
  if (file) {
    // 以前のURLをクリア
    if (audioUrl.value) {
      URL.revokeObjectURL(audioUrl.value);
    }
    
    // 新しいURLを作成
    audioUrl.value = URL.createObjectURL(file);
  } else {
    clearAudio();
  }
};

// 音声ファイルが読み込まれたときの処理
const handleAudioLoaded = async () => {
  if (!audioFile.value || !audioUrl.value) return;
  
  try {
    // AudioContextの初期化
    if (!audioContext.value) {
      audioContext.value = new (window.AudioContext || window.AudioContext)();
    }
    
    // ファイルを読み込む
    const arrayBuffer = await audioFile.value.arrayBuffer();
    
    // AudioBufferに変換
    audioBuffer.value = await audioContext.value.decodeAudioData(arrayBuffer);
    
    // イベントを発火
    emit('audio-loaded', audioBuffer.value);
  } catch (error) {
    console.error('音声ファイルの読み込みに失敗しました:', error);
    alert('音声ファイルの読み込みに失敗しました。別のファイルを試してください。');
  }
};

// 再生ボタンのクリックハンドラ
const playAudio = () => {
  if (audioPlayer.value) {
    audioPlayer.value.play();
  }
};

// クリアボタンのクリックハンドラ
const clearAudio = () => {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
  }
  
  audioFile.value = null;
  audioUrl.value = null;
  audioBuffer.value = null;
  
  if (audioPlayer.value) {
    audioPlayer.value.pause();
    audioPlayer.value.currentTime = 0;
  }
};

// 分析ボタンのクリックハンドラ
const analyzeAudio = () => {
  if (!audioBuffer.value) return;
  
  isAnalyzing.value = true;
  
  try {
    // 分析リクエストを発火
    emit('analysis-requested', audioBuffer.value);
  } catch (error) {
    console.error('音声分析に失敗しました:', error);
    alert('音声分析に失敗しました。');
  } finally {
    isAnalyzing.value = false;
  }
};

// コンポーネントがアンマウントされたときのクリーンアップ
onUnmounted(() => {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
  }
  
  if (audioContext.value && audioContext.value.state !== 'closed') {
    audioContext.value.close();
  }
});
</script>

<style scoped>
.audio-file-uploader {
  width: 100%;
}

.audio-player-container {
  margin-top: 16px;
}

audio {
  width: 100%;
  margin: 8px 0;
}
</style>