<template>
  <div class="voice-type-analysis-composite">
    <v-card class="mb-6">
      <v-card-title class="text-center text-h5">
        <v-icon start icon="mdi-dna" class="mr-2"></v-icon>
        複合型ボイスタイプ分析
      </v-card-title>
      <v-card-subtitle class="text-center">
        3つの音程を続けて歌った1つの音声ファイルをアップロードし、ヒートマップ上で各音程の範囲を指定して分析します
      </v-card-subtitle>
      <v-card-text>
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

        <v-card variant="outlined" class="mb-4 pa-4">
          <v-card-title class="text-subtitle-1">
            <v-icon start icon="mdi-music-note" class="mr-2"></v-icon>
            分析用音程ガイド
          </v-card-title>
          <v-card-text>
            <p class="text-body-2 mb-3">
              以下の3つの音程を順番に歌った音声を1ファイルにまとめてアップロードしてください。
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
              <v-btn v-if="!isPlayingSequence" color="primary" variant="tonal" prepend-icon="mdi-play" @click="playAllReferenceTones">
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
            <audio ref="audioPlayerRef" class="w-100" :src="audioUrl" controls @loadedmetadata="handleAudioLoaded"></audio>
            <div class="d-flex justify-end mt-2">
              <v-btn color="error" variant="outlined" size="small" prepend-icon="mdi-delete" @click="clearAudio">クリア</v-btn>
            </div>
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

    <div v-if="analysisData.timestamps.length > 0" class="d-flex justify-center gap-3 mb-6">
      <v-btn color="secondary" variant="outlined" prepend-icon="mdi-refresh" @click="resetSegments" :disabled="isAnalyzing">
        範囲をリセット
      </v-btn>
      <v-btn
        color="primary"
        size="large"
        prepend-icon="mdi-dna"
        @click="analyzeAudio"
        :disabled="!allSegmentsSet || isAnalyzing"
        :loading="isAnalyzing"
        class="px-8"
      >
        複合型ボイスタイプを分析
      </v-btn>
    </div>

    <v-alert
      v-if="analysisData.timestamps.length > 0 && !allSegmentsSet && !isAnalyzing"
      type="info" variant="tonal" class="mb-4"
    >
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
const isAnalyzing = ref(false), isAnalyzingFile = ref(false);
const isPlayingSequence = ref(false), playingIndex = ref(-1);
const sequenceTimeouts = ref<ReturnType<typeof setTimeout>[]>([]);

const pitchSet = computed(() => gender.value === 'male'
  ? [{ id: 'e3', name: 'E3', frequency: 164.81 }, { id: 'e4', name: 'E4', frequency: 329.63 }, { id: 'a4', name: 'A4', frequency: 440.00 }]
  : [{ id: 'a3', name: 'A3', frequency: 220.00 }, { id: 'a4', name: 'A4', frequency: 440.00 }, { id: 'e5', name: 'E5', frequency: 659.25 }]
);
const pitchLabels = computed(() => ({ low: pitchSet.value[0].name, mid: pitchSet.value[1].name, high: pitchSet.value[2].name }));

const audioFile = ref<File | null>(null), audioUrl = ref<string | null>(null);
const audioBuffer = ref<AudioBuffer | null>(null);
const audioPlayerRef = ref<HTMLAudioElement | null>(null);
const audioDuration = ref<number | undefined>(undefined);
const analysisData = ref<{ frequencyData: Uint8Array[]; timestamps: number[] }>({ frequencyData: [], timestamps: [] });
const timeSegments = ref<TimeSegment[]>([]);
const heatMapCanvasRef = ref<InstanceType<typeof VoiceTypeHeatMapCanvas> | null>(null);
const localAnalysisResult = ref<CompositeVoiceTypeAnalysisResult | null>(null);

const allSegmentsSet = computed(() =>
  timeSegments.value.length === 3 && timeSegments.value.every(s => s.start !== null && s.end !== null && s.end > s.start)
);
const rules = { fileType: (v: File | null) => !v || ['audio/mp3', 'audio/wav', 'audio/mpeg'].includes(v.type) || 'MP3またはWAVファイルのみ対応しています' };
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
  ps.forEach((p, i) => { scheduleTone(p.frequency, ctx.currentTime + i * IV, TL); sequenceTimeouts.value.push(setTimeout(() => { playingIndex.value = i; }, i * IV * 1000)); });
  sequenceTimeouts.value.push(setTimeout(() => { isPlayingSequence.value = false; playingIndex.value = -1; sequenceTimeouts.value = []; }, (ps.length * IV - GL) * 1000));
};
const onGenderChange = () => { timeSegments.value = []; localAnalysisResult.value = null; };
const handleFileChange = (file: File | null) => { analysisData.value = { frequencyData: [], timestamps: [] }; timeSegments.value = []; localAnalysisResult.value = null; audioFile.value = file; audioUrl.value = file ? URL.createObjectURL(file) : null; };
const handleSegmentsUpdated = (segments: TimeSegment[]) => { timeSegments.value = segments; };
const resetSegments = () => { heatMapCanvasRef.value?.resetSegments(); timeSegments.value = []; };
const clearAudio = () => { if (audioUrl.value) URL.revokeObjectURL(audioUrl.value); audioFile.value = null; audioUrl.value = null; audioBuffer.value = null; audioDuration.value = undefined; analysisData.value = { frequencyData: [], timestamps: [] }; timeSegments.value = []; localAnalysisResult.value = null; };


const handleAudioLoaded = async () => {
  const file = audioFile.value;
  if (!file) return;
  try {
    isAnalyzingFile.value = true;
    const ctx = initAudioContext();
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    audioBuffer.value = buffer;
    audioDuration.value = buffer.duration;
    const { frequencyAnalysisServiceWebAudio } = await import('../../services/FrequencyAnalysisServiceWebAudio');
    await frequencyAnalysisServiceWebAudio.initialize(16384);
    const { frequencyDataArray, timestamps } = await frequencyAnalysisServiceWebAudio.analyzeAudioBufferBatch(buffer, 8192, 512);
    analysisData.value = { frequencyData: frequencyDataArray, timestamps };
  } catch (error) {
    console.error('音声ファイルの読み込みに失敗しました:', error);
    alert('音声ファイルの読み込みに失敗しました。別のファイルを試してください。');
  } finally {
    isAnalyzingFile.value = false;
  }
};

const analyzeAudio = async () => {
  if (!allSegmentsSet.value || !audioBuffer.value) return;
  isAnalyzing.value = true;
  localAnalysisResult.value = null;
  try {
    emit('analysis-requested', audioBuffer.value, gender.value, timeSegments.value);
  } catch (error) {
    console.error('音声分析に失敗しました:', error);
    alert('音声分析に失敗しました。');
    isAnalyzing.value = false;
  }
};

watch(() => props.analysisCompleted, (c) => { if (c) isAnalyzing.value = false; });
watch(() => props.analysisResult, (r) => { if (r) localAnalysisResult.value = r; });

onUnmounted(() => {
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value);
  stopReferenceTones();
  if (audioContext.value && audioContext.value.state !== 'closed') audioContext.value.close();
});
</script>

<style scoped>
.voice-type-analysis-composite { width: 100%; }
.audio-player-container { margin-top: 16px; }
audio { width: 100%; margin: 8px 0; }
.gap-3 { gap: 12px; }
.legend-card { background: transparent; width: 100px; padding: 4px; border-radius: 4px; margin-left: 16px; }
.legend-gradient { height: 10px; width: 100%; background: linear-gradient(to right, #000080, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000); border-radius: 2px; margin-bottom: 2px; }
</style>

