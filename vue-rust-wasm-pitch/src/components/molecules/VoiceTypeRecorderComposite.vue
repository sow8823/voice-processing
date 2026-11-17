<template>
  <div class="voice-type-recorder-composite">
    <v-card class="mb-6">
      <v-card-title class="text-center text-h5">
        <v-icon start icon="mdi-microphone-plus" class="mr-2"></v-icon>
        複合型ボイスタイプ分析（録音）
      </v-card-title>
      <v-card-subtitle class="text-center">
        マイクで3つの音程を続けて録音し、ヒートマップ上で各音程の範囲を指定して分析します
      </v-card-subtitle>
      <v-card-text>
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

        <v-card variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-music-note" class="mr-2"></v-icon>
            分析用音程ガイド
          </v-card-title>
          <v-card-text>
            <p class="text-body-2 mb-3">
              以下の3つの音程を順番に歌った音声を録音してください。
              参考音ボタンを押すと、低い音から順番に連続で再生されます。
            </p>
            <v-list density="compact">
              <v-list-item v-for="(pitch, index) in pitchSet" :key="index">
                <template v-slot:prepend>
                  <v-chip size="small" :color="segmentColors[index]" class="mr-2">{{ index + 1 }}</v-chip>
                </template>
                <v-list-item-title>
                  {{ pitch.name }} ({{ pitch.frequency }} Hz)
                  <v-chip v-if="playingIndex === index" size="x-small" color="primary" class="ml-2">再生中</v-chip>
                </v-list-item-title>
              </v-list-item>
            </v-list>
            <div class="d-flex justify-center mt-3">
              <v-btn v-if="!isPlayingSequence" color="primary" variant="tonal" prepend-icon="mdi-play" :disabled="isRecording" @click="playAllReferenceTones">
                参考音を連続再生
              </v-btn>
              <v-btn v-else color="error" variant="tonal" prepend-icon="mdi-stop" @click="stopReferenceTones">
                再生を停止
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <v-card variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-microphone" class="mr-2"></v-icon>
            録音
          </v-card-title>
          <v-alert v-if="isRecording" type="error" variant="tonal" class="mb-4" icon="mdi-record">
            <div class="d-flex align-center justify-space-between">
              <div>
                <div class="font-weight-bold">録音中...</div>
                <div class="text-caption">経過時間: {{ formatTime(recordingDuration) }}</div>
              </div>
              <v-progress-circular indeterminate color="error" size="24"></v-progress-circular>
            </div>
          </v-alert>
          <div class="d-flex gap-3 flex-wrap">
            <v-btn v-if="!isRecording" color="error" size="large" prepend-icon="mdi-record" @click="startRecording" :disabled="isAnalyzingFile">録音開始</v-btn>
            <v-btn v-else color="grey-darken-2" size="large" prepend-icon="mdi-stop" @click="stopRecording">録音停止</v-btn>
            <v-btn v-if="recordedAudioUrl && !isRecording" color="error" variant="outlined" size="large" prepend-icon="mdi-delete" @click="clearRecording" :disabled="isAnalyzingFile">録音をクリア</v-btn>
          </div>
          <div v-if="recordedAudioUrl && !isRecording" class="mt-4">
            <div class="d-flex align-center mb-2">
              <v-icon icon="mdi-music-note" class="mr-2"></v-icon>
              <span class="text-subtitle-2">録音済み音声 ({{ formatTime(recordedDuration) }})</span>
            </div>
            <audio ref="audioPlayerRef" class="w-100" :src="recordedAudioUrl" controls></audio>
          </div>
        </v-card>
      </v-card-text>
    </v-card>

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

    <div v-if="analysisData.timestamps.length > 0" class="d-flex justify-center gap-3 mb-6">
      <v-btn color="secondary" variant="outlined" prepend-icon="mdi-refresh" @click="resetSegments" :disabled="isAnalyzing">
        範囲をリセット
      </v-btn>
      <v-btn color="primary" size="large" prepend-icon="mdi-dna" @click="analyzeAudio" :disabled="!allSegmentsSet || isAnalyzing" :loading="isAnalyzing" class="px-8">
        複合型ボイスタイプを分析
      </v-btn>
    </div>

    <v-alert v-if="analysisData.timestamps.length > 0 && !allSegmentsSet && !isAnalyzing" type="info" variant="tonal" class="mb-4">
      ヒートマップ上で3つの音程（低音・中音・高音）の時間範囲をすべて指定してください。
    </v-alert>

    <VoiceTypeResultComposite v-if="localAnalysisResult" :analysis-result="localAnalysisResult" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue';
import VoiceTypeResultComposite from './VoiceTypeResultComposite.vue';
import VoiceTypeHeatMapCanvas from '../atoms/VoiceTypeHeatMapCanvas.vue';
import type { TimeSegment } from '../atoms/VoiceTypeHeatMapCanvas.vue';
import type { CompositeVoiceTypeAnalysisResult } from '../../services/VoiceTypeAnalysisService';

const emit = defineEmits<{ (e: 'analysis-requested', audioBuffer: AudioBuffer, gender: string, segments: TimeSegment[]): void; }>();
const props = defineProps<{ analysisCompleted?: boolean; analysisResult?: CompositeVoiceTypeAnalysisResult | null; }>();

const segmentColors = ['light-blue', 'green', 'orange'];
const gender = ref<'male' | 'female'>('male');
const audioContext = ref<AudioContext | null>(null);
const isAnalyzing = ref(false), isAnalyzingFile = ref(false), isRecording = ref(false);
const isPlayingSequence = ref(false), playingIndex = ref(-1);
const sequenceTimeouts = ref<ReturnType<typeof setTimeout>[]>([]);
const recordingDuration = ref(0), recordedDuration = ref(0);
const recordingTimer = ref<ReturnType<typeof setInterval> | null>(null);
const mediaRecorder = ref<MediaRecorder | null>(null);
const recordedChunks = ref<Blob[]>([]);
const recordedBlob = ref<Blob | null>(null);
const recordedAudioUrl = ref<string | null>(null);
const audioPlayerRef = ref<HTMLAudioElement | null>(null);
const audioBuffer = ref<AudioBuffer | null>(null);
const audioDuration = ref<number | undefined>(undefined);
const analysisData = ref<{ frequencyData: Uint8Array[]; timestamps: number[] }>({ frequencyData: [], timestamps: [] });
const timeSegments = ref<TimeSegment[]>([]);
const heatMapCanvasRef = ref<InstanceType<typeof VoiceTypeHeatMapCanvas> | null>(null);
const localAnalysisResult = ref<CompositeVoiceTypeAnalysisResult | null>(null);

const pitchSet = computed(() => gender.value === 'male'
  ? [{ id: 'e3', name: 'E3', frequency: 164.81 }, { id: 'e4', name: 'E4', frequency: 329.63 }, { id: 'a4', name: 'A4', frequency: 440.00 }]
  : [{ id: 'a3', name: 'A3', frequency: 220.00 }, { id: 'a4', name: 'A4', frequency: 440.00 }, { id: 'e5', name: 'E5', frequency: 659.25 }]
);
const pitchLabels = computed(() => ({ low: pitchSet.value[0].name, mid: pitchSet.value[1].name, high: pitchSet.value[2].name }));
const allSegmentsSet = computed(() =>
  timeSegments.value.length === 3 && timeSegments.value.every(s => s.start !== null && s.end !== null && s.end > s.start)
);
const initAudioContext = () => { if (!audioContext.value) audioContext.value = new AudioContext(); return audioContext.value; };
const scheduleTone = (f: number, st: number, d: number) => {
  const ctx = initAudioContext(), osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(f, st);
  gain.gain.setValueAtTime(0, st); gain.gain.linearRampToValueAtTime(0.5, st + 0.05);
  gain.gain.setValueAtTime(0.5, st + d - 0.05); gain.gain.linearRampToValueAtTime(0, st + d);
  osc.connect(gain); gain.connect(ctx.destination); osc.start(st); osc.stop(st + d);
};
const stopReferenceTones = () => { sequenceTimeouts.value.forEach(t => clearTimeout(t)); sequenceTimeouts.value = []; isPlayingSequence.value = false; playingIndex.value = -1; };
const playAllReferenceTones = () => {
  stopReferenceTones();
  const ctx = initAudioContext(), ps = pitchSet.value, TL = 2.0, GL = 0.5, IV = TL + GL;
  isPlayingSequence.value = true; playingIndex.value = 0;
  ps.forEach((p, i) => {
    scheduleTone(p.frequency, ctx.currentTime + i * IV, TL);
    sequenceTimeouts.value.push(setTimeout(() => { playingIndex.value = i; }, i * IV * 1000));
  });
  sequenceTimeouts.value.push(setTimeout(() => { isPlayingSequence.value = false; playingIndex.value = -1; sequenceTimeouts.value = []; }, (ps.length * IV - GL) * 1000));
};
const formatTime = (s: number): string => {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 100);
  return `${m}:${sec.toString().padStart(2,'0')}.${ms.toString().padStart(2,'0')}`;
};
const getSupportedMimeType = (): string =>
  ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg','audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) ?? '';


const analyzeFileForHeatmap = async (buffer: AudioBuffer) => {
  const { frequencyAnalysisServiceWebAudio } = await import('../../services/FrequencyAnalysisServiceWebAudio');
  await frequencyAnalysisServiceWebAudio.initialize(16384);
  const { frequencyDataArray, timestamps } = await frequencyAnalysisServiceWebAudio.analyzeAudioBufferBatch(buffer, 8192, 512);
  analysisData.value = { frequencyData: frequencyDataArray, timestamps };
};

const processRecordedAudio = async (blob: Blob) => {
  try {
    isAnalyzingFile.value = true;
    const buffer = await initAudioContext().decodeAudioData(await blob.arrayBuffer());
    audioBuffer.value = buffer; audioDuration.value = buffer.duration;
    await analyzeFileForHeatmap(buffer);
  } catch (e) {
    console.error('録音データの処理に失敗しました:', e);
    alert('録音データの処理に失敗しました。もう一度録音してください。');
  } finally { isAnalyzingFile.value = false; }
};

const clearRecording = () => {
  if (recordedAudioUrl.value) { URL.revokeObjectURL(recordedAudioUrl.value); recordedAudioUrl.value = null; }
  recordedBlob.value = null; recordedChunks.value = []; recordedDuration.value = 0; recordingDuration.value = 0;
  audioBuffer.value = null; audioDuration.value = undefined;
  analysisData.value = { frequencyData: [], timestamps: [] };
  timeSegments.value = []; localAnalysisResult.value = null;
};

const stopRecording = () => {
  if (mediaRecorder.value && isRecording.value) {
    mediaRecorder.value.stop(); isRecording.value = false; recordedDuration.value = recordingDuration.value;
    if (recordingTimer.value) { clearInterval(recordingTimer.value); recordingTimer.value = null; }
  }
};

const startRecording = async () => {
  try {
    clearRecording();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedMimeType();
    mediaRecorder.value = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    recordedChunks.value = [];
    mediaRecorder.value.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.value.push(e.data); };
    mediaRecorder.value.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunks.value, { type: mimeType || 'audio/webm' });
      recordedBlob.value = blob;
      if (recordedAudioUrl.value) URL.revokeObjectURL(recordedAudioUrl.value);
      recordedAudioUrl.value = URL.createObjectURL(blob);
      await processRecordedAudio(blob);
    };
    mediaRecorder.value.start(100); isRecording.value = true; recordingDuration.value = 0;
    recordingTimer.value = setInterval(() => { recordingDuration.value += 0.1; }, 100);
  } catch (e) {
    console.error('録音の開始に失敗しました:', e);
    alert('マイクへのアクセスに失敗しました。ブラウザの設定を確認してください。');
  }
};

const handleSegmentsUpdated = (segments: TimeSegment[]) => { timeSegments.value = segments; };
const resetSegments = () => { heatMapCanvasRef.value?.resetSegments(); timeSegments.value = []; };

const analyzeAudio = async () => {
  if (!allSegmentsSet.value || !audioBuffer.value) return;
  isAnalyzing.value = true; localAnalysisResult.value = null;
  try {
    emit('analysis-requested', audioBuffer.value, gender.value, timeSegments.value);
  } catch (e) {
    console.error('音声分析に失敗しました:', e);
    alert('音声分析に失敗しました。');
    isAnalyzing.value = false;
  }
};

watch(() => props.analysisCompleted, (c) => { if (c) isAnalyzing.value = false; });
watch(() => props.analysisResult, (r) => { if (r) localAnalysisResult.value = r; });

onUnmounted(() => {
  if (isRecording.value) stopRecording();
  if (recordingTimer.value) clearInterval(recordingTimer.value);
  if (recordedAudioUrl.value) URL.revokeObjectURL(recordedAudioUrl.value);
  stopReferenceTones();
  if (audioContext.value && audioContext.value.state !== 'closed') audioContext.value.close();
});
</script>

<style scoped>
.voice-type-recorder-composite { width: 100%; }
audio { width: 100%; margin: 8px 0; }
.gap-3 { gap: 12px; }
.legend-card { background: transparent; width: 100px; padding: 4px; border-radius: 4px; margin-left: 16px; }
.legend-gradient { height: 10px; width: 100%; background: linear-gradient(to right, #000080, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000); border-radius: 2px; margin-bottom: 2px; }
</style>

