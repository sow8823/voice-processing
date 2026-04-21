<template>
  <div class="voice-type-recorder">
    <!-- ステップ1: 性別選択 & 録音 -->
    <v-card class="mb-6">
      <v-card-title class="text-center text-h5">
        <v-icon start icon="mdi-microphone-plus" class="mr-2"></v-icon>
        ボイスタイプ分類（録音）
      </v-card-title>
      <v-card-subtitle class="text-center">
        マイクで3つの音程を続けて録音し、ヒートマップ上で各音程の範囲を指定して分析します
      </v-card-subtitle>

      <v-card-text>
        <!-- 性別選択 -->
        <v-card variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-gender-male-female" class="mr-2"></v-icon>
            性別を選択
          </v-card-title>
          <v-radio-group v-model="gender" inline :disabled="isRecording">
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
              以下の3つの音程を順番に歌った音声を録音してください。
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
                    :disabled="isRecording"
                  ></v-btn>
                </template>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>

        <!-- 録音セクション -->
        <v-card variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-microphone" class="mr-2"></v-icon>
            録音
          </v-card-title>

          <!-- 録音中の表示 -->
          <v-alert
            v-if="isRecording"
            type="error"
            variant="tonal"
            class="mb-4"
            icon="mdi-record"
          >
            <div class="d-flex align-center justify-space-between">
              <div>
                <div class="font-weight-bold">録音中...</div>
                <div class="text-caption">経過時間: {{ formatTime(recordingDuration) }}</div>
              </div>
              <v-progress-circular
                indeterminate
                color="error"
                size="24"
              ></v-progress-circular>
            </div>
          </v-alert>

          <!-- 録音コントロール -->
          <div class="d-flex gap-3 flex-wrap">
            <v-btn
              v-if="!isRecording"
              color="error"
              size="large"
              prepend-icon="mdi-record"
              @click="startRecording"
              :disabled="isAnalyzingFile"
            >
              録音開始
            </v-btn>
            <v-btn
              v-else
              color="grey-darken-2"
              size="large"
              prepend-icon="mdi-stop"
              @click="stopRecording"
            >
              録音停止
            </v-btn>

            <v-btn
              v-if="recordedAudioUrl && !isRecording"
              color="error"
              variant="outlined"
              size="large"
              prepend-icon="mdi-delete"
              @click="clearRecording"
              :disabled="isAnalyzingFile"
            >
              録音をクリア
            </v-btn>
          </div>

          <!-- 録音済み音声の再生 -->
          <div v-if="recordedAudioUrl && !isRecording" class="mt-4">
            <div class="d-flex align-center mb-2">
              <v-icon icon="mdi-music-note" class="mr-2"></v-icon>
              <span class="text-subtitle-2">録音済み音声 ({{ formatTime(recordedDuration) }})</span>
            </div>
            <audio
              ref="audioPlayerRef"
              class="w-100"
              :src="recordedAudioUrl"
              controls
            ></audio>
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
          <span>録音データを分析中...</span>
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
      v-if="localAnalysisResult"
      :analysis-result="localAnalysisResult"
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

// 録音関連の状態
const isRecording = ref<boolean>(false);
const mediaRecorder = ref<MediaRecorder | null>(null);
const recordedChunks = ref<Blob[]>([]);
const recordedAudioUrl = ref<string | null>(null);
const recordedBlob = ref<Blob | null>(null);
const recordingDuration = ref<number>(0);
const recordedDuration = ref<number>(0);
const recordingTimer = ref<ReturnType<typeof setInterval> | null>(null);
const audioPlayerRef = ref<HTMLAudioElement | null>(null);

// 音声バッファ
const audioBuffer = ref<AudioBuffer | null>(null);
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
const localAnalysisResult = ref<VoiceTypeAnalysisResult | null>(null);

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

// すべてのセグメントが設定されているか
const allSegmentsSet = computed(() => {
  return timeSegments.value.length === 3 &&
    timeSegments.value.every(s => s.start !== null && s.end !== null && s.end > s.start);
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

// 時間フォーマット（秒 → mm:ss.xx）
const formatTime = (seconds: number): string => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

// 録音開始
const startRecording = async () => {
  try {
    // 既存の録音データをクリア
    clearRecording();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // MediaRecorderのMIMEタイプを決定（ブラウザ互換性のため）
    const mimeType = getSupportedMimeType();
    const options = mimeType ? { mimeType } : {};

    mediaRecorder.value = new MediaRecorder(stream, options);
    recordedChunks.value = [];

    mediaRecorder.value.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.value.push(event.data);
      }
    };

    mediaRecorder.value.onstop = async () => {
      // ストリームのトラックを停止
      stream.getTracks().forEach(track => track.stop());

      // 録音データをBlobに変換
      const blob = new Blob(recordedChunks.value, { type: mimeType || 'audio/webm' });
      recordedBlob.value = blob;

      // URLを作成
      if (recordedAudioUrl.value) {
        URL.revokeObjectURL(recordedAudioUrl.value);
      }
      recordedAudioUrl.value = URL.createObjectURL(blob);

      // AudioBufferに変換してヒートマップ分析を実行
      await processRecordedAudio(blob);
    };

    // 録音開始
    mediaRecorder.value.start(100); // 100msごとにデータを収集
    isRecording.value = true;
    recordingDuration.value = 0;

    // 録音時間カウンター
    recordingTimer.value = setInterval(() => {
      recordingDuration.value += 0.1;
    }, 100);

    console.log('録音を開始しました');
  } catch (error) {
    console.error('録音の開始に失敗しました:', error);
    alert('マイクへのアクセスに失敗しました。ブラウザの設定を確認してください。');
  }
};

// 録音停止
const stopRecording = () => {
  if (mediaRecorder.value && isRecording.value) {
    mediaRecorder.value.stop();
    isRecording.value = false;
    recordedDuration.value = recordingDuration.value;

    // タイマーを停止
    if (recordingTimer.value) {
      clearInterval(recordingTimer.value);
      recordingTimer.value = null;
    }

    console.log('録音を停止しました');
  }
};

// 録音データをクリア
const clearRecording = () => {
  if (recordedAudioUrl.value) {
    URL.revokeObjectURL(recordedAudioUrl.value);
    recordedAudioUrl.value = null;
  }
  recordedBlob.value = null;
  recordedChunks.value = [];
  recordedDuration.value = 0;
  recordingDuration.value = 0;
  audioBuffer.value = null;
  audioDuration.value = undefined;
  analysisData.value = { frequencyData: [], timestamps: [] };
  timeSegments.value = [];
  localAnalysisResult.value = null;
};

// サポートされているMIMEタイプを取得
const getSupportedMimeType = (): string => {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
};

// 録音データを処理してAudioBufferに変換し、ヒートマップ分析を実行
const processRecordedAudio = async (blob: Blob) => {
  try {
    isAnalyzingFile.value = true;
    const context = initAudioContext();

    // BlobをArrayBufferに変換
    const arrayBuffer = await blob.arrayBuffer();

    // AudioBufferに変換
    const buffer = await context.decodeAudioData(arrayBuffer);
    audioBuffer.value = buffer;
    audioDuration.value = buffer.duration;

    console.log(`録音データを読み込みました: ${buffer.duration.toFixed(2)}秒`);

    // ヒートマップ用の周波数分析を実行
    await analyzeFileForHeatmap(buffer);
  } catch (error) {
    console.error('録音データの処理に失敗しました:', error);
    alert('録音データの処理に失敗しました。もう一度録音してください。');
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

// 分析ボタンのクリックハンドラ
const analyzeAudio = async () => {
  if (!allSegmentsSet.value || !audioBuffer.value) return;

  isAnalyzing.value = true;
  localAnalysisResult.value = null;

  try {
    console.log('ボイスタイプ分析を開始します（録音データ）');
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
    localAnalysisResult.value = result;
  }
});

// コンポーネントがアンマウントされたときのクリーンアップ
onUnmounted(() => {
  // 録音中なら停止
  if (isRecording.value) {
    stopRecording();
  }

  // タイマーを停止
  if (recordingTimer.value) {
    clearInterval(recordingTimer.value);
  }

  // URLをクリア
  if (recordedAudioUrl.value) {
    URL.revokeObjectURL(recordedAudioUrl.value);
  }

  // オシレーターを停止
  if (oscillator.value) {
    oscillator.value.stop();
    oscillator.value.disconnect();
  }

  // AudioContextを閉じる
  if (audioContext.value && audioContext.value.state !== 'closed') {
    audioContext.value.close();
  }
});
</script>

<style scoped>
.voice-type-recorder {
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
