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
            
            <div v-if="isAnalyzed && audioBuffer" class="time-slider-container mt-3">
              <div class="d-flex justify-space-between mb-1">
                <span class="text-caption">{{ formatTime(0) }}</span>
                <span class="text-caption">{{ formatTime(audioBuffer.duration) }}</span>
              </div>
              <v-slider
                v-model="sliderPosition"
                :min="0"
                :max="Math.ceil(audioBuffer.duration * 120)"
                :step="1"
                hide-details
                density="compact"
                color="primary"
                track-color="grey-darken-1"
                @update:model-value="handleSliderChange"
                :disabled="!isAnalyzed"
              >
                <template v-slot:prepend>
                  <v-icon size="small">mdi-clock-outline</v-icon>
                </template>
                <template v-slot:append>
                  <span class="text-caption">{{ formatTime(sliderPosition / 120) }}</span>
                </template>
              </v-slider>
              <div class="text-caption text-center mt-1">
                1秒 = 120分割 (8.33ms/分割)
              </div>
            </div>
            
            <div class="d-flex justify-space-between align-center mt-4">
              <v-btn
                color="info"
                prepend-icon="mdi-waveform"
                @click="analyzeAudio"
                :disabled="!audioUrl || isPlaying || isAnalyzing"
                :loading="isAnalyzing"
                class="mr-2"
              >
                分析
              </v-btn>
              
              <v-btn
                :color="isPlaying ? 'error' : 'primary'"
                :prepend-icon="isPlaying ? 'mdi-stop' : 'mdi-play'"
                @click="togglePlayback"
                :disabled="!audioUrl || !isAnalyzed"
                :loading="isLoading"
              >
                {{ isPlaying ? '停止' : '再生' }}
              </v-btn>
              
              <v-btn
                color="error"
                variant="outlined"
                prepend-icon="mdi-delete"
                @click="clearAudio"
                :disabled="!audioUrl || isPlaying"
              >
                クリア
              </v-btn>
            </div>
          </v-card>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted, watch } from 'vue';

// イベント
const emit = defineEmits<{
  (e: 'audio-loaded', audioBuffer: AudioBuffer): void;
  (e: 'analysis-requested', audioBuffer: AudioBuffer): void;
  (e: 'playback-started', currentTime: number): void;
  (e: 'playback-ended'): void;
  (e: 'playback-stopped'): void;
  (e: 'playback-time-updated', currentTime: number): void;
  (e: 'seek-to-time', seekTime: number): void;
}>();

// 親コンポーネントからのプロップス
const props = defineProps<{
  analysisCompleted?: boolean;
}>();

// リアクティブな状態
const audioFile = ref<File | null>(null);
const audioUrl = ref<string | null>(null);
const audioPlayer = ref<HTMLAudioElement | null>(null);
const audioContext = ref<AudioContext | null>(null);
const audioBuffer = ref<AudioBuffer | null>(null);
const isAnalyzing = ref<boolean>(false);
const isPlaying = ref<boolean>(false);
const isLoading = ref<boolean>(false);
const isAnalyzed = ref<boolean>(false);
const sliderPosition = ref<number>(0); // スライダーの位置（120分割/秒）
const animationFrameId = ref<number | null>(null); // アニメーションフレームID
const analysisData = ref<{
  pitchData: number[];
  frequencyData: Uint8Array[];
  timestamps: number[];
}>({
  pitchData: [],
  frequencyData: [],
  timestamps: []
});

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

// 分析ボタンのクリックハンドラ
const analyzeAudio = async () => {
  if (!audioBuffer.value) return;
  
  isAnalyzing.value = true;
  isAnalyzed.value = false; // 分析開始時にリセット
  
  try {
    console.log('音声ファイルの分析を開始します');
    
    // 分析リクエストを発火
    emit('analysis-requested', audioBuffer.value);
    
    // 注意: 分析完了フラグは親コンポーネントから通知される
  } catch (error) {
    console.error('音声分析に失敗しました:', error);
    alert('音声分析に失敗しました。');
  }
};

// 親コンポーネントからの分析完了通知を監視
watch(() => props.analysisCompleted, (completed) => {
  if (completed) {
    console.log('分析が完了しました');
    isAnalyzed.value = true;
    isAnalyzing.value = false;
  }
});

// 再生/停止のトグルハンドラ
const togglePlayback = () => {
  if (isPlaying.value) {
    stopAudio();
  } else {
    playAudio();
  }
};

// スライダーを滑らかに更新するアニメーション関数
const updateSliderAnimation = () => {
  if (!audioPlayer.value || !isPlaying.value) {
    if (animationFrameId.value !== null) {
      cancelAnimationFrame(animationFrameId.value);
      animationFrameId.value = null;
    }
    return;
  }
  
  const currentTime = audioPlayer.value.currentTime;
  
  // スライダーの位置を更新（1秒 = 120分割）
  const newPosition = Math.round(currentTime * 120);
  if (sliderPosition.value !== newPosition) {
    sliderPosition.value = newPosition;
    
    // 表示を更新
    emit('playback-time-updated', currentTime);
  }
  
  // 次のフレームをリクエスト
  animationFrameId.value = requestAnimationFrame(updateSliderAnimation);
};

// 再生ボタンのクリックハンドラ - 分析済みデータを使用して再生
const playAudio = async () => {
  if (!audioBuffer.value || !audioPlayer.value || !isAnalyzed.value) return;
  
  isLoading.value = true;
  
  try {
    // 再生を開始
    await audioPlayer.value.play();
    
    // 状態を更新
    isPlaying.value = true;
    
    console.log('音声ファイルの再生を開始しました');
    
    // 再生開始イベントを発火
    emit('playback-started', audioPlayer.value.currentTime);
    
    // 再生開始時に現在位置のデータを表示するために、playback-time-updatedイベントも発火
    const currentTime = audioPlayer.value.currentTime;
    sliderPosition.value = Math.round(currentTime * 120);
    emit('playback-time-updated', currentTime);
    
    // アニメーションを開始
    if (animationFrameId.value === null) {
      animationFrameId.value = requestAnimationFrame(updateSliderAnimation);
    }
  } catch (error) {
    console.error('音声再生に失敗しました:', error);
    alert('音声再生に失敗しました。');
    isPlaying.value = false;
  } finally {
    isLoading.value = false;
  }
};

// 停止ハンドラ
const stopAudio = () => {
  if (!audioPlayer.value) return;
  
  try {
    // 再生を停止
    audioPlayer.value.pause();
    audioPlayer.value.currentTime = 0;
    
    // 状態を更新
    isPlaying.value = false;
    
    // アニメーションを停止
    if (animationFrameId.value !== null) {
      cancelAnimationFrame(animationFrameId.value);
      animationFrameId.value = null;
    }
    
    console.log('音声ファイルの再生を停止しました');
    
    // 停止イベントを発火
    emit('playback-stopped');
  } catch (error) {
    console.error('音声停止に失敗しました:', error);
  }
};

// クリアボタンのクリックハンドラ
const clearAudio = () => {
  // 再生中なら停止
  if (isPlaying.value) {
    stopAudio();
  }
  
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
  }
  
  audioFile.value = null;
  audioUrl.value = null;
  audioBuffer.value = null;
  isAnalyzed.value = false;
  sliderPosition.value = 0;
  
  // 分析データをクリア
  analysisData.value = {
    pitchData: [],
    frequencyData: [],
    timestamps: []
  };
  
  if (audioPlayer.value) {
    audioPlayer.value.pause();
    audioPlayer.value.currentTime = 0;
  }
  
  console.log('音声ファイルをクリアしました');
};

// 音声再生が終了したときの処理
const handleAudioEnded = () => {
  console.log('音声再生が終了しました');
  isPlaying.value = false;
  isAnalyzing.value = false;
  
  // アニメーションを停止
  if (animationFrameId.value !== null) {
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
  
  emit('playback-ended');
};

// audioPlayerの参照が変更されたときにイベントリスナーを設定
watch(audioPlayer, (newPlayer: HTMLAudioElement | null, oldPlayer: HTMLAudioElement | null) => {
  // 古いプレーヤーからイベントリスナーを削除
  if (oldPlayer) {
    oldPlayer.removeEventListener('ended', handleAudioEnded);
    oldPlayer.removeEventListener('timeupdate', handleTimeUpdate);
  }
  
  // 新しいプレーヤーにイベントリスナーを追加
  if (newPlayer) {
    newPlayer.addEventListener('ended', handleAudioEnded);
    newPlayer.addEventListener('timeupdate', handleTimeUpdate);
  }
});

// 再生時間が更新されたときの処理
// 注: requestAnimationFrameを使用するため、この関数は主にデバッグ用になります
const handleTimeUpdate = () => {
  // アニメーションフレームで処理するため、ここでは何もしない
};

// スライダーの値が変更されたときの処理
const handleSliderChange = (value: number) => {
  if (!audioPlayer.value || !audioBuffer.value) return;
  
  // スライダーの値から時間を計算（1分割 = 1/120秒）
  const seekTime = value / 120;
  
  // 音声の再生位置を設定
  audioPlayer.value.currentTime = seekTime;
  
  // スライダーの位置に基づいて表示を更新するために親コンポーネントに通知
  // 再生中でなくても表示を更新するために、playback-time-updatedイベントも発火
  emit('seek-to-time', seekTime);
  emit('playback-time-updated', seekTime);
};

// 時間を「分:秒.ミリ秒」形式にフォーマットする関数
const formatTime = (seconds: number): string => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

// コンポーネントがマウントされたときのイベントリスナー設定
onMounted(() => {
  if (audioPlayer.value) {
    audioPlayer.value.addEventListener('ended', handleAudioEnded);
    audioPlayer.value.addEventListener('timeupdate', handleTimeUpdate);
  }
});

// コンポーネントがアンマウントされたときのクリーンアップ
onUnmounted(() => {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
  }
  
  if (audioContext.value && audioContext.value.state !== 'closed') {
    audioContext.value.close();
  }
  
  if (audioPlayer.value) {
    audioPlayer.value.removeEventListener('ended', handleAudioEnded);
    audioPlayer.value.removeEventListener('timeupdate', handleTimeUpdate);
  }
  
  // アニメーションを停止
  if (animationFrameId.value !== null) {
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
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

.time-slider-container {
  padding: 0 8px;
}
</style>