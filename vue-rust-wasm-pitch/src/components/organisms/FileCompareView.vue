<template>
  <div class="file-compare-view">
    <!-- ファイルアップロードエリア -->
    <v-row>
      <!-- ファイル1 -->
      <v-col cols="12" md="6">
        <v-card class="mb-4" :style="{ borderTop: `4px solid ${FILE1_COLOR}` }">
          <v-card-title class="text-h6 d-flex align-center" :style="{ color: FILE1_COLOR }">
            <v-icon start :color="FILE1_COLOR">mdi-file-music</v-icon>
            ファイル 1
          </v-card-title>
          <v-card-text>
            <v-file-input
              v-model="audioFile1"
              accept="audio/mp3,audio/wav,audio/mpeg"
              label="音声ファイルを選択"
              prepend-icon="mdi-music"
              show-size
              :rules="[rules.fileType]"
              :color="FILE1_COLOR"
              @update:model-value="(f) => handleFileChange(1, f)"
              :disabled="isAnalyzing"
            ></v-file-input>

            <div v-if="audioUrl1" class="mt-2">
              <v-card variant="outlined" class="pa-3">
                <div class="d-flex align-center mb-2">
                  <v-icon :color="FILE1_COLOR" class="mr-2">mdi-music-note</v-icon>
                  <span class="text-subtitle-2">{{ audioFile1?.name }}</span>
                </div>
                <audio ref="audioPlayer1" class="w-100" :src="audioUrl1" @loadedmetadata="() => handleAudioLoaded(1)"></audio>
              </v-card>
              <v-chip v-if="file1Analyzed" :color="FILE1_COLOR" size="small" class="mt-2" prepend-icon="mdi-check-circle">
                分析完了
              </v-chip>
            </div>

            <div class="d-flex gap-2 mt-3">
              <v-btn
                size="small"
                :color="FILE1_COLOR"
                variant="tonal"
                prepend-icon="mdi-waveform"
                :disabled="!audioUrl1 || isAnalyzing || isPlaying"
                :loading="isAnalyzing && analyzingTarget === 1"
                @click="analyzeFile(1)"
              >
                分析
              </v-btn>
              <v-btn
                size="small"
                color="error"
                variant="outlined"
                prepend-icon="mdi-delete"
                :disabled="isPlaying || isAnalyzing"
                @click="clearFile(1)"
              >
                クリア
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- ファイル2 -->
      <v-col cols="12" md="6">
        <v-card class="mb-4" :style="{ borderTop: `4px solid ${FILE2_COLOR}` }">
          <v-card-title class="text-h6 d-flex align-center" :style="{ color: FILE2_COLOR }">
            <v-icon start :color="FILE2_COLOR">mdi-file-music</v-icon>
            ファイル 2
          </v-card-title>
          <v-card-text>
            <v-file-input
              v-model="audioFile2"
              accept="audio/mp3,audio/wav,audio/mpeg"
              label="音声ファイルを選択"
              prepend-icon="mdi-music"
              show-size
              :rules="[rules.fileType]"
              :color="FILE2_COLOR"
              @update:model-value="(f) => handleFileChange(2, f)"
              :disabled="isAnalyzing"
            ></v-file-input>

            <div v-if="audioUrl2" class="mt-2">
              <v-card variant="outlined" class="pa-3">
                <div class="d-flex align-center mb-2">
                  <v-icon :color="FILE2_COLOR" class="mr-2">mdi-music-note</v-icon>
                  <span class="text-subtitle-2">{{ audioFile2?.name }}</span>
                </div>
                <audio ref="audioPlayer2" class="w-100" :src="audioUrl2" @loadedmetadata="() => handleAudioLoaded(2)"></audio>
              </v-card>
              <v-chip v-if="file2Analyzed" :color="FILE2_COLOR" size="small" class="mt-2" prepend-icon="mdi-check-circle">
                分析完了
              </v-chip>
            </div>

            <div class="d-flex gap-2 mt-3">
              <v-btn
                size="small"
                :color="FILE2_COLOR"
                variant="tonal"
                prepend-icon="mdi-waveform"
                :disabled="!audioUrl2 || isAnalyzing || isPlaying"
                :loading="isAnalyzing && analyzingTarget === 2"
                @click="analyzeFile(2)"
              >
                分析
              </v-btn>
              <v-btn
                size="small"
                color="error"
                variant="outlined"
                prepend-icon="mdi-delete"
                :disabled="isPlaying || isAnalyzing"
                @click="clearFile(2)"
              >
                クリア
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- 分析中プログレス -->
    <v-progress-linear
      v-if="isAnalyzing"
      indeterminate
      :color="analyzingTarget === 1 ? FILE1_COLOR : FILE2_COLOR"
      class="mb-4"
    ></v-progress-linear>

    <!-- 共通再生コントロール（両ファイル分析済みの場合のみ表示） -->
    <v-card class="mb-4" v-if="file1Analyzed || file2Analyzed">
      <v-card-title class="d-flex align-center">
        <v-icon start icon="mdi-play-circle" class="mr-2"></v-icon>
        再生コントロール
      </v-card-title>
      <v-card-text>
        <!-- 共通スライダー -->
        <div class="d-flex align-center mb-2">
          <span class="text-caption mr-2" style="min-width: 60px">{{ formatTime(currentPlaybackTime) }}</span>
          <v-slider
            v-model="sharedSliderPos"
            :min="0"
            :max="sharedSliderMax"
            :step="1"
            hide-details
            density="compact"
            color="primary"
            class="flex-grow-1"
            @update:model-value="handleSharedSliderChange"
          ></v-slider>
          <span class="text-caption ml-2" style="min-width: 60px">{{ formatTime(sharedSliderMax / 120) }}</span>
        </div>

        <!-- 再生/停止ボタン -->
        <div class="d-flex gap-2 justify-center mt-2">
          <v-btn
            :color="isPlaying ? 'error' : 'primary'"
            :prepend-icon="isPlaying ? 'mdi-stop' : 'mdi-play'"
            :disabled="!canPlay"
            @click="togglePlay"
          >
            {{ isPlaying ? '停止' : '再生' }}
          </v-btn>
        </div>

        <!-- 各ファイルの再生状態表示 -->
        <div class="d-flex justify-space-around mt-3">
          <div class="d-flex align-center">
            <v-icon :color="FILE1_COLOR" size="small" class="mr-1">mdi-circle</v-icon>
            <span class="text-caption" :style="{ color: FILE1_COLOR }">
              {{ file1Analyzed ? (audioFile1?.name ?? 'ファイル1') : 'ファイル1 (未分析)' }}
            </span>
          </div>
          <div class="d-flex align-center">
            <v-icon :color="FILE2_COLOR" size="small" class="mr-1">mdi-circle</v-icon>
            <span class="text-caption" :style="{ color: FILE2_COLOR }">
              {{ file2Analyzed ? (audioFile2?.name ?? 'ファイル2') : 'ファイル2 (未分析)' }}
            </span>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- 比較ヒートマップ -->
    <v-card class="mb-4" v-if="file1Analyzed || file2Analyzed">
      <v-card-title class="d-flex align-center justify-space-between">
        <div class="d-flex align-center">
          <v-icon start icon="mdi-compare" class="mr-2"></v-icon>
          <span>周波数ヒートマップ比較</span>
        </div>
        <div class="d-flex align-center gap-2">
          <v-chip size="small" :color="FILE1_COLOR" variant="tonal">
            <v-icon start size="small">mdi-square</v-icon>
            {{ file1Analyzed ? (audioFile1?.name ?? 'ファイル1') : 'ファイル1 (未分析)' }}
          </v-chip>
          <v-chip size="small" :color="FILE2_COLOR" variant="tonal">
            <v-icon start size="small">mdi-square</v-icon>
            {{ file2Analyzed ? (audioFile2?.name ?? 'ファイル2') : 'ファイル2 (未分析)' }}
          </v-chip>
        </div>
      </v-card-title>
      <v-card-text>
        <CompareHeatMapCanvas
          ref="compareCanvasRef"
          :file1-data="file1Analyzed ? analysisData1 : null"
          :file2-data="file2Analyzed ? analysisData2 : null"
          :file1-duration="audioBuffer1?.duration"
          :file2-duration="audioBuffer2?.duration"
          :file1-label="audioFile1?.name ?? 'ファイル1'"
          :file2-label="audioFile2?.name ?? 'ファイル2'"
          :current-playback-time="currentPlaybackTime"
        />
      </v-card-text>
    </v-card>

    <!-- 周波数スペクトル比較（再生位置のフレームを表示） -->
    <v-card class="mb-4" v-if="file1Analyzed || file2Analyzed">
      <v-card-title class="d-flex align-center">
        <v-icon start icon="mdi-chart-bar" class="mr-2"></v-icon>
        周波数スペクトル比較
        <span class="text-caption text-medium-emphasis ml-2">（再生位置: {{ formatTime(currentPlaybackTime) }}）</span>
      </v-card-title>
      <v-card-text>
        <v-row>
          <!-- ファイル1スペクトル -->
          <v-col cols="12" md="6">
            <div class="spectrum-label mb-1" :style="{ color: FILE1_COLOR }">
              <v-icon :color="FILE1_COLOR" size="small" class="mr-1">mdi-circle</v-icon>
              {{ audioFile1?.name ?? 'ファイル1' }}
            </div>
            <CompareSpectrumCanvas
              :frequency-data="currentFreqData1"
              :color="FILE1_COLOR"
              :label="audioFile1?.name ?? 'ファイル1'"
            />
          </v-col>
          <!-- ファイル2スペクトル -->
          <v-col cols="12" md="6">
            <div class="spectrum-label mb-1" :style="{ color: FILE2_COLOR }">
              <v-icon :color="FILE2_COLOR" size="small" class="mr-1">mdi-circle</v-icon>
              {{ audioFile2?.name ?? 'ファイル2' }}
            </div>
            <CompareSpectrumCanvas
              :frequency-data="currentFreqData2"
              :color="FILE2_COLOR"
              :label="audioFile2?.name ?? 'ファイル2'"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- 未分析時のプレースホルダー -->
    <v-card v-if="!file1Analyzed && !file2Analyzed" class="mb-4 text-center pa-8" variant="outlined">
      <v-icon size="64" color="grey-lighten-1">mdi-compare</v-icon>
      <div class="text-h6 text-grey mt-4">2つのファイルをアップロードして分析してください</div>
      <div class="text-body-2 text-grey-lighten-1 mt-2">
        各ファイルを選択し「分析」ボタンを押すと、周波数ヒートマップが重ねて表示されます
      </div>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import CompareHeatMapCanvas from '../atoms/CompareHeatMapCanvas.vue';
import CompareSpectrumCanvas from '../atoms/CompareSpectrumCanvas.vue';
import { pitchDetectionService } from '../../services';
import { frequencyAnalysisServiceWebAudio } from '../../services/FrequencyAnalysisServiceWebAudio';

const FILE1_COLOR = '#42a5f5';
const FILE2_COLOR = '#ef5350';

// ファイル1の状態
const audioFile1 = ref<File | null>(null);
const audioUrl1 = ref<string | null>(null);
const audioPlayer1 = ref<HTMLAudioElement | null>(null);
const audioBuffer1 = ref<AudioBuffer | null>(null);
const audioContext1 = ref<AudioContext | null>(null);
const file1Analyzed = ref(false);

// ファイル2の状態
const audioFile2 = ref<File | null>(null);
const audioUrl2 = ref<string | null>(null);
const audioPlayer2 = ref<HTMLAudioElement | null>(null);
const audioBuffer2 = ref<AudioBuffer | null>(null);
const audioContext2 = ref<AudioContext | null>(null);
const file2Analyzed = ref(false);

// 共通再生状態
const isPlaying = ref(false);
const isAnalyzing = ref(false);
const analyzingTarget = ref<1 | 2 | null>(null);
const currentPlaybackTime = ref(0);
const animFrameId = ref<number | null>(null);

// 共通スライダー
const sharedSliderPos = ref(0);
const sharedSliderMax = computed(() => {
  const d1 = audioBuffer1.value?.duration ?? 0;
  const d2 = audioBuffer2.value?.duration ?? 0;
  return Math.ceil(Math.max(d1, d2) * 120);
});

// 再生可能かどうか（少なくとも1ファイル分析済み）
const canPlay = computed(() => file1Analyzed.value || file2Analyzed.value);

const compareCanvasRef = ref<InstanceType<typeof CompareHeatMapCanvas> | null>(null);

// 分析データ
const analysisData1 = ref<{ frequencyData: Uint8Array[]; timestamps: number[] }>({
  frequencyData: [],
  timestamps: [],
});
const analysisData2 = ref<{ frequencyData: Uint8Array[]; timestamps: number[] }>({
  frequencyData: [],
  timestamps: [],
});

// 現在の再生位置のスペクトルデータ
const currentFreqData1 = ref<Uint8Array>(new Uint8Array(1024));
const currentFreqData2 = ref<Uint8Array>(new Uint8Array(1024));

const rules = {
  fileType: (value: File | null) => {
    if (!value) return true;
    const allowed = ['audio/mp3', 'audio/wav', 'audio/mpeg'];
    return allowed.includes(value.type) || 'MP3またはWAVファイルのみ対応しています';
  },
};

const formatTime = (seconds: number): string => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

// 再生位置に最も近いフレームのスペクトルデータを取得
const getFreqDataAtTime = (
  data: { frequencyData: Uint8Array[]; timestamps: number[] },
  time: number
): Uint8Array => {
  if (!data.frequencyData.length) return new Uint8Array(1024);
  const { timestamps, frequencyData } = data;
  let closestIdx = 0;
  let minDiff = Math.abs(timestamps[0] - time);
  for (let i = 1; i < timestamps.length; i++) {
    const diff = Math.abs(timestamps[i] - time);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return frequencyData[closestIdx] ?? new Uint8Array(1024);
};

// 再生位置が変わったらスペクトルデータを更新
const updateSpectraAtTime = (time: number) => {
  currentPlaybackTime.value = time;
  if (file1Analyzed.value) {
    currentFreqData1.value = getFreqDataAtTime(analysisData1.value, time);
  }
  if (file2Analyzed.value) {
    currentFreqData2.value = getFreqDataAtTime(analysisData2.value, time);
  }
};

// ファイル選択
const handleFileChange = async (fileNum: 1 | 2, files: File | File[] | null) => {
  const file = files instanceof Array ? files[0] : files;
  if (fileNum === 1) {
    if (audioUrl1.value) URL.revokeObjectURL(audioUrl1.value);
    audioUrl1.value = file ? URL.createObjectURL(file) : null;
    file1Analyzed.value = false;
    analysisData1.value = { frequencyData: [], timestamps: [] };
    audioBuffer1.value = null;
    currentFreqData1.value = new Uint8Array(1024);
  } else {
    if (audioUrl2.value) URL.revokeObjectURL(audioUrl2.value);
    audioUrl2.value = file ? URL.createObjectURL(file) : null;
    file2Analyzed.value = false;
    analysisData2.value = { frequencyData: [], timestamps: [] };
    audioBuffer2.value = null;
    currentFreqData2.value = new Uint8Array(1024);
  }
};

// 音声ロード完了
const handleAudioLoaded = async (fileNum: 1 | 2) => {
  const file = fileNum === 1 ? audioFile1.value : audioFile2.value;
  if (!file) return;
  try {
    if (fileNum === 1) {
      if (!audioContext1.value) audioContext1.value = new AudioContext();
      audioBuffer1.value = await audioContext1.value.decodeAudioData(await file.arrayBuffer());
    } else {
      if (!audioContext2.value) audioContext2.value = new AudioContext();
      audioBuffer2.value = await audioContext2.value.decodeAudioData(await file.arrayBuffer());
    }
  } catch (e) {
    console.error(`ファイル${fileNum}の読み込みに失敗:`, e);
  }
};

// 分析実行
const analyzeFile = async (fileNum: 1 | 2) => {
  const buffer = fileNum === 1 ? audioBuffer1.value : audioBuffer2.value;
  if (!buffer) return;

  isAnalyzing.value = true;
  analyzingTarget.value = fileNum;

  try {
    await pitchDetectionService.initialize();
    await frequencyAnalysisServiceWebAudio.initialize(16384);

    const bufferSize = 8192;
    const hopSize = 256;
    const numFrames = Math.floor((buffer.length - bufferSize) / hopSize) + 1;

    const { frequencyDataArray, timestamps } = await frequencyAnalysisServiceWebAudio.analyzeAudioBufferBatch(
      buffer, bufferSize, hopSize
    );

    const freqData: Uint8Array[] = [];
    for (let i = 0; i < numFrames && i < frequencyDataArray.length; i++) {
      freqData.push(new Uint8Array(frequencyDataArray[i]));
    }

    if (fileNum === 1) {
      analysisData1.value = { frequencyData: freqData, timestamps: timestamps.slice(0, freqData.length) };
      file1Analyzed.value = true;
      currentFreqData1.value = freqData[0] ?? new Uint8Array(1024);
    } else {
      analysisData2.value = { frequencyData: freqData, timestamps: timestamps.slice(0, freqData.length) };
      file2Analyzed.value = true;
      currentFreqData2.value = freqData[0] ?? new Uint8Array(1024);
    }
    console.log(`ファイル${fileNum}の分析完了: ${freqData.length}フレーム`);
  } catch (e) {
    console.error(`ファイル${fileNum}の分析に失敗:`, e);
    alert(`ファイル${fileNum}の分析に失敗しました。`);
  } finally {
    isAnalyzing.value = false;
    analyzingTarget.value = null;
  }
};

// 共通スライダー操作
const handleSharedSliderChange = (value: number) => {
  const seekTime = value / 120;
  if (audioPlayer1.value && file1Analyzed.value) audioPlayer1.value.currentTime = seekTime;
  if (audioPlayer2.value && file2Analyzed.value) audioPlayer2.value.currentTime = seekTime;
  updateSpectraAtTime(seekTime);
};

// 再生/停止トグル
const togglePlay = () => {
  isPlaying.value ? stopAll() : playAll();
};

const playAll = async () => {
  try {
    if (audioPlayer1.value && file1Analyzed.value) await audioPlayer1.value.play();
    if (audioPlayer2.value && file2Analyzed.value) await audioPlayer2.value.play();
    isPlaying.value = true;
    startAnimation();
  } catch (e) {
    console.error('再生失敗:', e);
    isPlaying.value = false;
  }
};

const stopAll = () => {
  if (audioPlayer1.value) { audioPlayer1.value.pause(); audioPlayer1.value.currentTime = 0; }
  if (audioPlayer2.value) { audioPlayer2.value.pause(); audioPlayer2.value.currentTime = 0; }
  isPlaying.value = false;
  sharedSliderPos.value = 0;
  updateSpectraAtTime(0);
  if (animFrameId.value !== null) {
    cancelAnimationFrame(animFrameId.value);
    animFrameId.value = null;
  }
};

// アニメーションループ（スライダー・スペクトル更新）
const startAnimation = () => {
  if (animFrameId.value !== null) cancelAnimationFrame(animFrameId.value);

  const animate = () => {
    if (!isPlaying.value) return;

    // 再生中のプレーヤーから現在時刻を取得（優先: ファイル1、なければファイル2）
    const player = (file1Analyzed.value && audioPlayer1.value)
      ? audioPlayer1.value
      : audioPlayer2.value;

    if (player) {
      const t = player.currentTime;
      sharedSliderPos.value = Math.round(t * 120);
      updateSpectraAtTime(t);
    }

    animFrameId.value = requestAnimationFrame(animate);
  };

  animFrameId.value = requestAnimationFrame(animate);
};

// ファイルクリア
const clearFile = (fileNum: 1 | 2) => {
  if (isPlaying.value) stopAll();
  if (fileNum === 1) {
    if (audioUrl1.value) URL.revokeObjectURL(audioUrl1.value);
    audioFile1.value = null;
    audioUrl1.value = null;
    audioBuffer1.value = null;
    file1Analyzed.value = false;
    analysisData1.value = { frequencyData: [], timestamps: [] };
    currentFreqData1.value = new Uint8Array(1024);
  } else {
    if (audioUrl2.value) URL.revokeObjectURL(audioUrl2.value);
    audioFile2.value = null;
    audioUrl2.value = null;
    audioBuffer2.value = null;
    file2Analyzed.value = false;
    analysisData2.value = { frequencyData: [], timestamps: [] };
    currentFreqData2.value = new Uint8Array(1024);
  }
};

// 再生終了時の共通処理
const handleEnded = () => {
  const p1Done = !audioPlayer1.value || audioPlayer1.value.ended || !file1Analyzed.value;
  const p2Done = !audioPlayer2.value || audioPlayer2.value.ended || !file2Analyzed.value;
  if (p1Done && p2Done) {
    isPlaying.value = false;
    sharedSliderPos.value = 0;
    updateSpectraAtTime(0);
    if (animFrameId.value !== null) {
      cancelAnimationFrame(animFrameId.value);
      animFrameId.value = null;
    }
  }
};

// audioPlayer refが設定されたときにイベントリスナーを登録
watch(audioPlayer1, (newPlayer, oldPlayer) => {
  oldPlayer?.removeEventListener('ended', handleEnded);
  newPlayer?.addEventListener('ended', handleEnded);
});
watch(audioPlayer2, (newPlayer, oldPlayer) => {
  oldPlayer?.removeEventListener('ended', handleEnded);
  newPlayer?.addEventListener('ended', handleEnded);
});

// クリーンアップ
onUnmounted(() => {
  if (audioUrl1.value) URL.revokeObjectURL(audioUrl1.value);
  if (audioUrl2.value) URL.revokeObjectURL(audioUrl2.value);
  if (audioContext1.value?.state !== 'closed') audioContext1.value?.close();
  if (audioContext2.value?.state !== 'closed') audioContext2.value?.close();
  if (animFrameId.value !== null) cancelAnimationFrame(animFrameId.value);
});
</script>

<style scoped>
.file-compare-view {
  width: 100%;
}

audio {
  width: 100%;
  margin: 4px 0;
}

.gap-2 {
  gap: 8px;
}

.spectrum-label {
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  align-items: center;
}
</style>
