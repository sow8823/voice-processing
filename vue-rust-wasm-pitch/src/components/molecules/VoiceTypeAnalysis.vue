<template>
  <div class="voice-type-analysis">
    <!-- ステップ1: 性別選択 & ファイルアップロード -->
    <v-card class="mb-6">
      <v-card-title class="text-center text-h5">
        <v-icon start icon="mdi-account-voice" class="mr-2"></v-icon>
        ボイスタイプ分類
      </v-card-title>
      <v-card-subtitle class="text-center">
        3つの音程を続けて歌った1つの音声ファイルをアップロードし、ヒートマップ上で各音程の範囲を指定して分析します
      </v-card-subtitle>

      <v-card-text>
        <!-- 性別選択 -->
        <v-card variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-gender-male-female" class="mr-2"></v-icon>
            性別を選択
          </v-card-title>
          <v-radio-group v-model="gender" inline @update:model-value="onGenderChange">
            <v-radio label="男性" value="male"></v-radio>
            <v-radio label="女性" value="female"></v-radio>
          </v-radio-group>
        </v-card>

        <!-- 音程ガイド -->
        <v-card variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-music-note" class="mr-2"></v-icon>
            分類用音程ガイド
          </v-card-title>
          <v-card-text>
            <p class="text-body-2 mb-3">
              以下の3つの音程を順番に歌った音声を1ファイルにまとめてアップロードしてください。
              参考音ボタンを押すと、その音程の音が再生されます。
            </p>
            <v-list density="compact">
              <v-list-item v-for="(pitch, index) in pitchSet" :key="index">
                <template v-slot:prepend>
                  <v-chip size="small" :color="segmentColors[index]" class="mr-2">{{ index + 1 }}</v-chip>
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

        <!-- ファイルアップロード -->
        <v-card variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-file-upload" class="mr-2"></v-icon>
            音声ファイルをアップロード
          </v-card-title>

          <v-file-input
            v-model="audioFile"
            accept="audio/mp3,audio/wav,audio/mpeg"
            label="3つの音程を歌った音声ファイルを選択"
            prepend-icon="mdi-music"
            show-size
            :rules="[rules.fileType]"
            @update:model-value="(f) => handleFileChange(Array.isArray(f) ? f[0] ?? null : f)"
            class="mb-2"
          ></v-file-input>

          <div v-if="audioUrl" class="audio-player-container">
            <div class="d-flex align-center mb-2">
              <v-icon icon="mdi-music-note" class="mr-2"></v-icon>
              <span class="text-subtitle-2">{{ audioFile?.name }}</span>
            </div>
            <audio
              ref="audioPlayerRef"
              class="w-100"
              :src="audioUrl"
              controls
              @loadedmetadata="handleAudioLoaded"
            ></audio>
            <div class="d-flex justify-end mt-2">
              <v-btn
                color="error"
                variant="outlined"
                size="small"
                prepend-icon="mdi-delete"
                @click="clearAudio"
              >
                クリア
              </v-btn>
            </div>
          </div>
        </v-card>
      </v-card-text>
    </v-card>

    <!-- ステップ2: ヒートマップ表示 & 時間範囲指定 -->
    <v-card v-if="isAnalyzingFile || analysisData.timestamps.length > 0" class="mb-6">
      <v-card-title class="d-flex align-center">
        <v-icon start icon="mdi-gradient-vertical" class="mr-2"></v-icon>
        周波数ヒートマップ
        <v-spacer />
        <v-card class="legend-card">
          <div class="legend-gradient"></div>
          <div class="d-flex justify-space-between">
            <span class="text-caption text-white">低</span>
            <span class="text-caption text-white">高</span>
          </div>
        </v-card>
      </v-card-title>

      <v-card-text>
        <div v-if="isAnalyzingFile" class="d-flex justify-center align-center py-8">
          <v-progress-circular indeterminate color="primary" size="48" class="mr-4"></v-progress-circular>
          <span>ファイルを分析中...</span>
        </div>

        <VoiceTypeHeatMapCanvas
          v-else-if="analysisData.timestamps.length > 0"
          ref="heatMapCanvasRef"
          :analysis-data="analysisData"
          :duration="audioDuration"
          :pitch-labels="pitchLabels"
          @segments-updated="handleSegmentsUpdated"
        />
      </v-card-text>
    </v-card>

    <!-- ステップ3: 分析ボタン -->
    <div v-if="analysisData.timestamps.length > 0" class="d-flex justify-center gap-3 mb-6">
      <v-btn
        color="secondary"
        variant="outlined"
        prepend-icon="mdi-refresh"
        @click="resetSegments"
        :disabled="isAnalyzing"
      >
        範囲をリセット
      </v-btn>
      <v-btn
        color="primary"
        size="large"
        prepend-icon="mdi-waveform"
        @click="analyzeAudio"
        :disabled="!allSegmentsSet || isAnalyzing"
        :loading="isAnalyzing"
        class="px-8"
      >
        ボイスタイプを分析
      </v-btn>
    </div>

    <!-- 未設定セグメントの警告 -->
    <v-alert
      v-if="analysisData.timestamps.length > 0 && !allSegmentsSet && !isAnalyzing"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      ヒートマップ上で3つの音程（低音・中音・高音）の時間範囲をすべて指定してください。
    </v-alert>

    <!-- 分析結果表示 -->
    <VoiceTypeResult
      v-if="analysisResult"
      :analysis-result="analysisResult"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue';
import VoiceTypeResult from './VoiceTypeResult.vue';
import VoiceTypeHeatMapCanvas from '../atoms/VoiceTypeHeatMapCanvas.vue';
import type { TimeSegment } from '../atoms/VoiceTypeHeatMapCanvas.vue';
import type { VoiceTypeAnalysisResult } from '../../services/VoiceTypeAnalysisService';

// イベント
const emit = defineEmits<{
  (e: 'analysis-requested', audioBuffer: AudioBuffer, gender: string, segments: TimeSegment[]): void;
}>();

// 親コンポーネントからのプロップス
const props = defineProps<{
  analysisCompleted?: boolean;
  analysisResult?: VoiceTypeAnalysisResult | null;
}>();

// セグメントカラー（ヒートマップと同じ色）
const segmentColors = ['light-blue', 'green', 'orange'];

// リアクティブな状態
const gender = ref<'male' | 'female'>('male');
const audioContext = ref<AudioContext | null>(null);
const isAnalyzing = ref<boolean>(false);
const isAnalyzingFile = ref<boolean>(false);
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

// ヒートマップ用ピッチラベル
const pitchLabels = computed(() => {
  const ps = pitchSet.value;
  return {
    low: ps[0].name,
    mid: ps[1].name,
    high: ps[2].name,
  };
});

// 音声ファイル関連の状態
const audioFile = ref<File | null>(null);
const audioUrl = ref<string | null>(null);
const audioBuffer = ref<AudioBuffer | null>(null);
const audioPlayerRef = ref<HTMLAudioElement | null>(null);
const audioDuration = ref<number | undefined>(undefined);

// 分析データ
const analysisData = ref<{
  frequencyData: Uint8Array[];
  timestamps: number[];
}>({
  frequencyData: [],
  timestamps: [],
});

// 時間セグメント
const timeSegments = ref<TimeSegment[]>([]);

// ヒートマップキャンバスの参照
const heatMapCanvasRef = ref<InstanceType<typeof VoiceTypeHeatMapCanvas> | null>(null);

// 分析結果（ローカル）
const analysisResult = ref<VoiceTypeAnalysisResult | null>(null);

// すべてのセグメントが設定されているか
const allSegmentsSet = computed(() => {
  return timeSegments.value.length === 3 &&
    timeSegments.value.every(s => s.start !== null && s.end !== null && s.end > s.start);
});

// バリデーションルール
const rules = {
  fileType: (value: File | null) => {
    if (!value) return true;
    const allowedTypes = ['audio/mp3', 'audio/wav', 'audio/mpeg'];
    return allowedTypes.includes(value.type) || 'MP3またはWAVファイルのみ対応しています';
  }
};

// AudioContextの初期化
const initAudioContext = () => {
  if (!audioContext.value) {
    audioContext.value = new (window.AudioContext || window.AudioContext)();
  }
  return audioContext.value;
};

// 参考音を再生する関数
const playReferenceTone = (frequency: number) => {
  if (oscillator.value) {
    oscillator.value.stop();
    oscillator.value.disconnect();
    oscillator.value = null;
  }
  const context = initAudioContext();
  oscillator.value = context.createOscillator();
  oscillator.value.type = 'sine';
  oscillator.value.frequency.setValueAtTime(frequency, context.currentTime);
  const gainNode = context.createGain();
  gainNode.gain.setValueAtTime(0, context.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.1);
  gainNode.gain.linearRampToValueAtTime(0, context.currentTime + 1.5);
  oscillator.value.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.value.start();
  setTimeout(() => {
    if (oscillator.value) {
      oscillator.value.stop();
      oscillator.value.disconnect();
      oscillator.value = null;
    }
  }, 1500);
};

// 性別変更時の処理
const onGenderChange = () => {
  // セグメントのラベルはpitchLabelsのcomputedで自動更新される
  // セグメントの範囲はリセットしない（ファイルは同じなので）
};

// ファイル選択時の処理
const handleFileChange = async (file: File | null) => {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
    audioUrl.value = null;
  }
  audioBuffer.value = null;
  audioDuration.value = undefined;
  analysisData.value = { frequencyData: [], timestamps: [] };
  timeSegments.value = [];
  analysisResult.value = null;

  if (file) {
    audioFile.value = file;
    audioUrl.value = URL.createObjectURL(file);
  } else {
    audioFile.value = null;
  }
};

// 音声ファイルが読み込まれたときの処理
const handleAudioLoaded = async () => {
  const file = audioFile.value;
  if (!file) return;

  try {
    isAnalyzingFile.value = true;
    const context = initAudioContext();

    // AudioBufferに変換
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await context.decodeAudioData(arrayBuffer);
    audioBuffer.value = buffer;
    audioDuration.value = buffer.duration;

    console.log(`音声ファイルを読み込みました: ${buffer.duration.toFixed(2)}秒`);

    // ファイルの周波数分析を実行（ヒートマップ表示用）
    await analyzeFileForHeatmap(buffer);
  } catch (error) {
    console.error('音声ファイルの読み込みに失敗しました:', error);
    alert('音声ファイルの読み込みに失敗しました。別のファイルを試してください。');
  } finally {
    isAnalyzingFile.value = false;
  }
};

// ヒートマップ表示用のファイル分析
const analyzeFileForHeatmap = async (buffer: AudioBuffer) => {
  const { frequencyAnalysisServiceWebAudio } = await import('../../services/FrequencyAnalysisServiceWebAudio');

  await frequencyAnalysisServiceWebAudio.initialize(16384);

  const bufferSize = 8192;
  const hopSize = 512;

  const { frequencyDataArray, timestamps } = await frequencyAnalysisServiceWebAudio.analyzeAudioBufferBatch(
    buffer,
    bufferSize,
    hopSize
  );

  analysisData.value = {
    frequencyData: frequencyDataArray,
    timestamps,
  };

  console.log(`ヒートマップ用分析完了: ${frequencyDataArray.length}フレーム`);
};

// セグメント更新ハンドラ
const handleSegmentsUpdated = (segments: TimeSegment[]) => {
  timeSegments.value = segments;
};

// セグメントリセット
const resetSegments = () => {
  heatMapCanvasRef.value?.resetSegments();
  timeSegments.value = [];
};

// 音声をクリア
const clearAudio = () => {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
  }
  audioFile.value = null;
  audioUrl.value = null;
  audioBuffer.value = null;
  audioDuration.value = undefined;
  analysisData.value = { frequencyData: [], timestamps: [] };
  timeSegments.value = [];
  analysisResult.value = null;
};

// 分析ボタンのクリックハンドラ
const analyzeAudio = async () => {
  if (!allSegmentsSet.value || !audioBuffer.value) return;

  isAnalyzing.value = true;
  analysisResult.value = null;

  try {
    console.log('ボイスタイプ分析を開始します');
    console.log(`性別: ${gender.value}`);
    console.log('セグメント:', timeSegments.value);

    emit('analysis-requested', audioBuffer.value, gender.value, timeSegments.value);
  } catch (error) {
    console.error('音声分析に失敗しました:', error);
    alert('音声分析に失敗しました。');
    isAnalyzing.value = false;
  }
};

// 親コンポーネントからの分析完了通知を監視
watch(() => props.analysisCompleted, (completed) => {
  if (completed) {
    isAnalyzing.value = false;
  }
});

// 親コンポーネントからの分析結果を監視
watch(() => props.analysisResult, (result) => {
  if (result) {
    analysisResult.value = result;
  }
});

// コンポーネントがアンマウントされたときのクリーンアップ
onUnmounted(() => {
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value);
  if (oscillator.value) {
    oscillator.value.stop();
    oscillator.value.disconnect();
  }
  if (audioContext.value && audioContext.value.state !== 'closed') {
    audioContext.value.close();
  }
});
</script>

<style scoped>
.voice-type-analysis {
  width: 100%;
}

.audio-player-container {
  margin-top: 16px;
}

audio {
  width: 100%;
  margin: 8px 0;
}

.gap-3 {
  gap: 12px;
}

.legend-card {
  background: transparent;
  width: 100px;
  padding: 4px;
  border-radius: 4px;
  margin-left: 16px;
}

.legend-gradient {
  height: 10px;
  width: 100%;
  background: linear-gradient(to right, #000080, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000);
  border-radius: 2px;
  margin-bottom: 2px;
}
</style>
