<template>
  <div class="voice-type-uploader">
    <v-card class="mb-6">
      <v-card-title class="text-center text-h5">
        <v-icon start icon="mdi-account-voice" class="mr-2"></v-icon>
        ボイスタイプ診断
      </v-card-title>
      <v-card-subtitle class="text-center">
        指定された3つの音程で発声した音声をアップロードして分析します
      </v-card-subtitle>
      
      <v-card-text>
        <!-- 性別選択 -->
        <v-card variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-gender-male-female" class="mr-2"></v-icon>
            性別を選択
          </v-card-title>
          <v-radio-group v-model="gender" inline>
            <v-radio label="男性" value="male"></v-radio>
            <v-radio label="女性" value="female"></v-radio>
          </v-radio-group>
        </v-card>
        
        <!-- 音程ガイド -->
        <v-card variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-music-note" class="mr-2"></v-icon>
            診断用音程ガイド
          </v-card-title>
          <v-card-text>
            <p class="text-body-2 mb-4">
              {{ gender === 'male' ? '男性' : '女性' }}用の3つの音程で発声した音声をそれぞれアップロードしてください。
              参考音ボタンを押すと、その音程の音が再生されます。
            </p>
            
            <v-list>
              <v-list-item v-for="(pitch, index) in pitchSet" :key="index">
                <template v-slot:prepend>
                  <v-icon icon="mdi-music-note"></v-icon>
                </template>
                <v-list-item-title>{{ pitch.name }} ({{ pitch.frequency }} Hz)</v-list-item-title>
                <template v-slot:append>
                  <v-btn
                    icon="mdi-play"
                    size="small"
                    color="primary"
                    variant="tonal"
                    @click="playReferenceTone(pitch.frequency)"
                    :title="`${pitch.name}の参考音を再生`"
                  ></v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
        
        <!-- 音声アップロードセクション -->
        <v-card v-for="(pitch, index) in pitchSet" :key="index" variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-file-upload" class="mr-2"></v-icon>
            {{ pitch.name }} の音声をアップロード
          </v-card-title>
          
          <v-file-input
            v-model="audioFiles[pitch.id]"
            accept="audio/mp3,audio/wav"
            :label="`${pitch.name} の音声ファイルを選択`"
            prepend-icon="mdi-music"
            show-size
            :rules="[rules.fileType]"
            @update:model-value="(file) => handleFileChange(file as File | null, pitch.id)"
            class="mb-2"
          ></v-file-input>
          
          <div v-if="audioUrls[pitch.id]" class="audio-player-container">
            <div class="d-flex align-center mb-2">
              <v-icon icon="mdi-music-note" class="mr-2"></v-icon>
              <span class="text-subtitle-2">{{ audioFiles[pitch.id]?.name }}</span>
            </div>
            
            <audio
              :ref="el => setAudioPlayerRef(el as HTMLAudioElement | null, pitch.id)"
              class="w-100"
              :src="audioUrls[pitch.id] || undefined"
              controls
              @loadedmetadata="(event) => handleAudioLoaded(event, pitch.id)"
            ></audio>
            
            <div class="d-flex justify-end mt-2">
              <v-btn
                color="error"
                variant="outlined"
                size="small"
                prepend-icon="mdi-delete"
                @click="() => clearAudio(pitch.id)"
                :disabled="isPlaying[pitch.id]"
              >
                クリア
              </v-btn>
            </div>
          </div>
        </v-card>
        
        <!-- 分析ボタン -->
        <div class="d-flex justify-center mt-6">
          <v-btn
            color="primary"
            size="large"
            prepend-icon="mdi-waveform"
            @click="analyzeAudio"
            :disabled="!allPitchesUploaded || isAnalyzing"
            :loading="isAnalyzing"
            class="px-8"
          >
            ボイスタイプを分析
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted, watch } from 'vue';

// イベント
const emit = defineEmits<{
  (e: 'audio-loaded', audioBuffers: Record<string, AudioBuffer>): void;
  (e: 'analysis-requested', audioBuffers: Record<string, AudioBuffer>, gender: string): void;
  (e: 'playback-started', pitchId: string, currentTime: number): void;
  (e: 'playback-ended', pitchId: string): void;
  (e: 'playback-stopped', pitchId: string): void;
}>();

// 親コンポーネントからのプロップス
const props = defineProps<{
  analysisCompleted?: boolean;
}>();

// リアクティブな状態
const gender = ref<'male' | 'female'>('male');
const audioContext = ref<AudioContext | null>(null);
const isAnalyzing = ref<boolean>(false);
const isAnalyzed = ref<boolean>(false);
const oscillator = ref<OscillatorNode | null>(null);

// 音程セット
const pitchSet = computed(() => {
  if (gender.value === 'male') {
    return [
      { id: 'e3', name: 'E3', frequency: 164.81 },
      { id: 'e4', name: 'E4', frequency: 329.63 },
      { id: 'a4', name: 'A4', frequency: 440.00 }
    ];
  } else {
    return [
      { id: 'a3', name: 'A3', frequency: 220.00 },
      { id: 'a4', name: 'A4', frequency: 440.00 },
      { id: 'e5', name: 'E5', frequency: 659.25 }
    ];
  }
});

// 音声ファイル関連の状態
const audioFiles = ref<Record<string, File | null>>({});
const audioUrls = ref<Record<string, string | null>>({});
const audioPlayers = ref<Record<string, HTMLAudioElement | null>>({});
const audioBuffers = ref<Record<string, AudioBuffer | null>>({});
const isPlaying = ref<Record<string, boolean>>({});

// すべての音程がアップロードされているかどうか
const allPitchesUploaded = computed(() => {
  return pitchSet.value.every(pitch => !!audioBuffers.value[pitch.id]);
});

// バリデーションルール
const rules = {
  fileType: (value: File | null) => {
    if (!value) return true;
    const allowedTypes = ['audio/mp3', 'audio/wav', 'audio/mpeg'];
    return allowedTypes.includes(value.type) || 'MP3またはWAVファイルのみ対応しています';
  }
};

// 性別が変更されたときに音声ファイルをクリア
watch(gender, () => {
  clearAllAudio();
});

// AudioContextの初期化
const initAudioContext = () => {
  if (!audioContext.value) {
    audioContext.value = new (window.AudioContext || window.AudioContext)();
  }
  return audioContext.value;
};

// 参考音を再生する関数
const playReferenceTone = (frequency: number) => {
  // 既存のオシレーターを停止
  if (oscillator.value) {
    oscillator.value.stop();
    oscillator.value.disconnect();
    oscillator.value = null;
  }
  
  const context = initAudioContext();
  
  // オシレーターを作成
  oscillator.value = context.createOscillator();
  oscillator.value.type = 'sine';
  oscillator.value.frequency.setValueAtTime(frequency, context.currentTime);
  
  // ゲインノードを作成（音量調整用）
  const gainNode = context.createGain();
  gainNode.gain.setValueAtTime(0, context.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.1);
  gainNode.gain.linearRampToValueAtTime(0, context.currentTime + 1.5);
  
  // 接続して再生
  oscillator.value.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.value.start();
  
  // 1.5秒後に停止
  setTimeout(() => {
    if (oscillator.value) {
      oscillator.value.stop();
      oscillator.value.disconnect();
      oscillator.value = null;
    }
  }, 1500);
};

// オーディオプレーヤーの参照を設定
const setAudioPlayerRef = (el: HTMLAudioElement | null, pitchId: string) => {
  audioPlayers.value[pitchId] = el;
};

// ファイル選択時の処理
const handleFileChange = async (file: File | null, pitchId: string) => {
  // 以前のURLをクリア
  if (audioUrls.value[pitchId]) {
    URL.revokeObjectURL(audioUrls.value[pitchId]!);
  }
  
  if (file) {
    audioFiles.value[pitchId] = file;
    audioUrls.value[pitchId] = URL.createObjectURL(file);
    audioBuffers.value[pitchId] = null; // 新しいファイルがアップロードされたらバッファをリセット
    isPlaying.value[pitchId] = false;
  } else {
    clearAudio(pitchId);
  }
};

// 音声ファイルが読み込まれたときの処理
const handleAudioLoaded = async (event: Event, pitchId: string) => {
  const file = audioFiles.value[pitchId];
  if (!file) return;
  
  try {
    const context = initAudioContext();
    
    // ファイルを読み込む
    const arrayBuffer = await file.arrayBuffer();
    
    // AudioBufferに変換
    const buffer = await context.decodeAudioData(arrayBuffer);
    audioBuffers.value[pitchId] = buffer;
    
    console.log(`${pitchId} の音声ファイルを読み込みました`);
    
    // すべての音程がアップロードされたかチェック
    if (allPitchesUploaded.value) {
      // イベントを発火
      emit('audio-loaded', { ...audioBuffers.value } as Record<string, AudioBuffer>);
    }
  } catch (error) {
    console.error('音声ファイルの読み込みに失敗しました:', error);
    alert('音声ファイルの読み込みに失敗しました。別のファイルを試してください。');
  }
};

// 分析ボタンのクリックハンドラ
const analyzeAudio = async () => {
  if (!allPitchesUploaded.value) return;
  
  isAnalyzing.value = true;
  isAnalyzed.value = false; // 分析開始時にリセット
  
  try {
    console.log('音声ファイルの分析を開始します');
    console.log(`選択された性別: ${gender.value}`);
    
    // 分析リクエストを発火
    emit('analysis-requested', { ...audioBuffers.value } as Record<string, AudioBuffer>, gender.value);
    
    // 注意: 分析完了フラグは親コンポーネントから通知される
  } catch (error) {
    console.error('音声分析に失敗しました:', error);
    alert('音声分析に失敗しました。');
    isAnalyzing.value = false;
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

// 特定の音程の音声をクリア
const clearAudio = (pitchId: string) => {
  if (audioUrls.value[pitchId]) {
    URL.revokeObjectURL(audioUrls.value[pitchId]!);
  }
  
  audioFiles.value[pitchId] = null;
  audioUrls.value[pitchId] = null;
  audioBuffers.value[pitchId] = null;
  isPlaying.value[pitchId] = false;
  
  if (audioPlayers.value[pitchId]) {
    audioPlayers.value[pitchId]!.pause();
    audioPlayers.value[pitchId]!.currentTime = 0;
  }
  
  console.log(`${pitchId} の音声ファイルをクリアしました`);
};

// すべての音声をクリア
const clearAllAudio = () => {
  // 現在のpitchSetに基づいてクリア
  pitchSet.value.forEach(pitch => {
    clearAudio(pitch.id);
  });
  
  isAnalyzed.value = false;
  console.log('すべての音声ファイルをクリアしました');
};

// 音声再生が開始されたときの処理
const handlePlaybackStarted = (pitchId: string, currentTime: number) => {
  isPlaying.value[pitchId] = true;
  emit('playback-started', pitchId, currentTime);
};

// 音声再生が終了したときの処理
const handlePlaybackEnded = (pitchId: string) => {
  isPlaying.value[pitchId] = false;
  emit('playback-ended', pitchId);
};

// コンポーネントがマウントされたときの処理
onMounted(() => {
  // 音声プレーヤーのイベントリスナーを設定
  Object.keys(audioPlayers.value).forEach(pitchId => {
    const player = audioPlayers.value[pitchId];
    if (player) {
      player.addEventListener('play', () => handlePlaybackStarted(pitchId, player.currentTime));
      player.addEventListener('ended', () => handlePlaybackEnded(pitchId));
    }
  });
});

// コンポーネントがアンマウントされたときのクリーンアップ
onUnmounted(() => {
  // URLをクリア
  Object.values(audioUrls.value).forEach(url => {
    if (url) URL.revokeObjectURL(url);
  });
  
  // オシレーターを停止
  if (oscillator.value) {
    oscillator.value.stop();
    oscillator.value.disconnect();
  }
  
  // AudioContextを閉じる
  if (audioContext.value && audioContext.value.state !== 'closed') {
    audioContext.value.close();
  }
  
  // 音声プレーヤーのイベントリスナーを削除
  Object.keys(audioPlayers.value).forEach(pitchId => {
    const player = audioPlayers.value[pitchId];
    if (player) {
      player.removeEventListener('play', () => handlePlaybackStarted(pitchId, player.currentTime));
      player.removeEventListener('ended', () => handlePlaybackEnded(pitchId));
    }
  });
});
</script>

<style scoped>
.voice-type-uploader {
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