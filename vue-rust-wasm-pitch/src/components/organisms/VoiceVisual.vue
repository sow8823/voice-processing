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
      <v-tab value="voicetype">
        <v-icon start>mdi-account-voice</v-icon>
        ボイスタイプ分析
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <!-- マイク入力タブ -->
      <v-window-item value="microphone">
        <MicrophoneInput
          @pitch-detected="handlePitchDetected"
          @frequency-data-updated="handleFrequencyDataUpdated"
          @processing-state-changed="handleProcessingStateChanged"
        />
      </v-window-item>

      <!-- ファイル入力タブ -->
      <v-window-item value="file">
        <AudioFileUploader
          @audio-loaded="handleAudioFileLoaded"
          @analysis-requested="analyzeAudioFile"
          @playback-started="handlePlaybackStarted"
          @playback-time-updated="handlePlaybackTimeUpdated"
          @playback-ended="handlePlaybackEnded"
          @playback-stopped="handlePlaybackStopped"
          @seek-to-time="handleSeekToTime"
          :analysis-completed="analysisCompleted"
        />
      </v-window-item>
      
      <!-- ボイスタイプ分析タブ -->
      <v-window-item value="voicetype">
        <VoiceTypeAnalysis
          @audio-loaded="handleMultipleAudioFilesLoaded"
          @analysis-requested="analyzeMultipleAudioFiles"
          @playback-started="handlePitchPlaybackStarted"
          @playback-time-updated="handlePlaybackTimeUpdated"
          @playback-ended="handlePlaybackEnded"
          @playback-stopped="handlePlaybackStopped"
          @seek-to-time="handleSeekToTime"
          :analysis-completed="analysisCompleted"
          :analysis-result="voiceTypeAnalysisResult"
        />
      </v-window-item>
    </v-window>

    <!-- タブに応じて適切なヒートマップコンポーネントを表示 -->
    <v-card class="mb-6">
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
        <!-- マイク入力（リアルタイム）モードの場合 -->
        <RealtimeHeatMapCanvas
          v-if="activeTab === 'microphone'"
          ref="realtimeHeatMapCanvasRef"
          :frequencyData="frequencyData"
          :base-frequency="currentPitch"
        />
        
        <!-- ファイル入力モードの場合 -->
        <FileHeatMapCanvas
          v-else
          ref="fileHeatMapCanvasRef"
          :frequencyData="frequencyData"
          :base-frequency="currentPitch"
          :analysisData="analysisData"
          :currentPlaybackTime="currentPlaybackTime"
          :duration="fileAudioBuffer?.duration"
        />
      </v-card-text>
    </v-card>

    <v-row>
      <v-col cols="12" md="6">
        <v-card height="100%">
          <v-card-title>
            <v-icon start icon="mdi-waveform" class="mr-2"></v-icon>
            ピッチ検出
          </v-card-title>
          <v-card-text>
            <PitchCanvas :currentPitch="currentPitch" />
          </v-card-text>
        </v-card>
      </v-col>
      
      <v-col cols="12" md="6">
        <v-card height="100%">
          <v-card-title>
            <v-icon start icon="mdi-chart-bar" class="mr-2"></v-icon>
            周波数スペクトル
          </v-card-title>
          <v-card-text>
            <SpectrumCanvas
              :frequencyData="frequencyData"
              :base-frequency="currentPitch"
              :detectedBaseFrequency="detectedBaseFrequency"
              :detectedHarmonic2Frequency="detectedHarmonic2Frequency"
              :detectedHarmonic3Frequency="detectedHarmonic3Frequency"
            />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, watch } from "vue";
import PitchCanvas from "../atoms/PitchCanvas.vue";
import SpectrumCanvas from "../atoms/SpectrumCanvas.vue";
import { audioService, pitchDetectionService } from "../../services";
import { VoiceTypeAnalysisService } from "../../services/VoiceTypeAnalysisService";
import RealtimeHeatMapCanvas from "../atoms/RealtimeHeatMapCanvas.vue";
import FileHeatMapCanvas from "../atoms/FileHeatMapCanvas.vue";
import AudioFileUploader from "../molecules/AudioFileUploader.vue";
import MicrophoneInput from "../molecules/MicrophoneInput.vue";
import VoiceTypeAnalysis from "../molecules/VoiceTypeAnalysis.vue";
import fourierTransform from "fourier-transform";
import type { VoiceTypeAnalysisResult } from "../../services/VoiceTypeAnalysisService";

const activeTab = ref<string>("microphone");
const currentPitch = ref<number>(0);
const frequencyData = ref<Uint8Array>(new Uint8Array(1024));
const isProcessing = ref<boolean>(false);
const isLoading = ref<boolean>(false);
const fileAudioBuffer = ref<AudioBuffer | null>(null);
const realtimeHeatMapCanvasRef = ref<InstanceType<typeof RealtimeHeatMapCanvas> | null>(null);
const fileHeatMapCanvasRef = ref<InstanceType<typeof FileHeatMapCanvas> | null>(null);
const analysisCompleted = ref<boolean>(false);

// 分析データを保存するための状態
const analysisData = ref<{
  pitchData: number[];
  frequencyData: Uint8Array[];
  timestamps: number[];
}>({
  pitchData: [],
  frequencyData: [],
  timestamps: []
});

// ボイスタイプ分析結果を保存するための状態
const voiceTypeAnalysisResult = ref<VoiceTypeAnalysisResult | null>(null);

// 検出された基音成分と倍音成分の周波数
const detectedBaseFrequency = ref<number | undefined>(undefined);
const detectedHarmonic2Frequency = ref<number | undefined>(undefined);
const detectedHarmonic3Frequency = ref<number | undefined>(undefined);

// 現在の再生位置
const currentPlaybackTime = ref<number>(0);

// タブ切り替え時の処理
watch(activeTab, (newTab, oldTab) => {
  console.log(`タブが切り替わりました: ${oldTab} -> ${newTab}`);
  
  // データをリセット
  resetData();
});

// データをリセットする関数
const resetData = () => {
  currentPitch.value = 0;
  frequencyData.value = new Uint8Array(1024);
  analysisData.value = {
    pitchData: [],
    frequencyData: [],
    timestamps: []
  };
  currentPlaybackTime.value = 0;
  detectedBaseFrequency.value = undefined;
  detectedHarmonic2Frequency.value = undefined;
  detectedHarmonic3Frequency.value = undefined;
  analysisCompleted.value = false;
};

// マイク入力関連のハンドラ
const handlePitchDetected = (pitch: number) => {
  currentPitch.value = pitch;
};

const handleFrequencyDataUpdated = (data: Uint8Array) => {
  frequencyData.value = data;
};

const handleProcessingStateChanged = (state: boolean) => {
  isProcessing.value = state;
};

// ファイル入力関連のハンドラ
const handleAudioFileLoaded = (buffer: AudioBuffer) => {
  fileAudioBuffer.value = buffer;
  console.log('音声ファイルが読み込まれました:', buffer.duration, '秒');
};

const analyzeAudioFile = async (buffer: AudioBuffer) => {
  try {
    analysisCompleted.value = false;
    
    console.log('音声ファイルの分析を開始します');
    
    // 分析データを初期化
    analysisData.value = {
      pitchData: [],
      frequencyData: [],
      timestamps: []
    };
    
    // ピッチ検出サービスを初期化
    await pitchDetectionService.initialize();
    
    // 音声ファイルを分析
    const sampleRate = buffer.sampleRate;
    const bufferSize = 2048;
    const hopSize = 1024;
    const duration = buffer.duration;
    const numFrames = Math.floor((buffer.length - bufferSize) / hopSize) + 1;
    
    // 分析用の一時バッファ
    const tempBuffer = new Float32Array(bufferSize);
    
    // 各フレームを分析
    for (let i = 0; i < numFrames; i++) {
      // フレームの開始位置
      const startSample = i * hopSize;
      
      // フレームの時間（秒）
      const timestamp = startSample / sampleRate;
      
      // バッファにフレームのデータをコピー
      buffer.copyFromChannel(tempBuffer, 0, startSample);
      
      // ピッチを検出
      const pitch = pitchDetectionService.detectPitch(tempBuffer, sampleRate);
      
      // 周波数スペクトルを計算
      const spectrum = fourierTransform(tempBuffer);
      const frequencyData = new Uint8Array(spectrum.length);
      
      // スペクトルをdB単位に変換し、0-255の範囲にスケーリング
      for (let j = 0; j < spectrum.length; j++) {
        const magnitude = spectrum[j];
        // 0の場合はログが-Infinityになるので回避
        const dB = magnitude > 0 ? 20 * Math.log10(magnitude) : -100;
        const normalized = Math.max(0, Math.min(255, (dB + 100) * 2.55));
        frequencyData[j] = normalized;
      }
      
      // 結果を保存
      analysisData.value.pitchData.push(pitch);
      analysisData.value.frequencyData.push(frequencyData);
      analysisData.value.timestamps.push(timestamp);
    }
    
    console.log(`分析完了: ${numFrames}フレーム`);
    analysisCompleted.value = true;
  } catch (error) {
    console.error('音声ファイルの分析に失敗しました:', error);
    alert('音声ファイルの分析に失敗しました。');
  }
};

// 再生関連のハンドラ
const handlePlaybackStarted = (currentTime: number) => {
  console.log('再生開始:', currentTime);
  updateDisplayForPlayback(currentTime);
};

const handlePitchPlaybackStarted = (pitchId: string, currentTime: number) => {
  console.log(`${pitchId}の再生開始:`, currentTime);
};

const handlePlaybackTimeUpdated = (currentTime: number) => {
  currentPlaybackTime.value = currentTime;
  updateDisplayForPlayback(currentTime);
};

const handlePlaybackEnded = () => {
  console.log('再生終了');
  currentPlaybackTime.value = 0;
};

const handlePlaybackStopped = () => {
  console.log('再生停止');
  currentPlaybackTime.value = 0;
};

const handleSeekToTime = (seekTime: number) => {
  console.log('シーク:', seekTime);
  updateDisplayForPlayback(seekTime);
};

// 再生位置に応じて表示を更新する関数
const updateDisplayForPlayback = (time: number) => {
  if (!analysisData.value.timestamps.length) return;
  
  // 現在の時間に最も近いフレームのインデックスを見つける
  const timestamps = analysisData.value.timestamps;
  let closestIndex = 0;
  let minDiff = Math.abs(timestamps[0] - time);
  
  for (let i = 1; i < timestamps.length; i++) {
    const diff = Math.abs(timestamps[i] - time);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }
  
  // 対応するデータを表示
  currentPitch.value = analysisData.value.pitchData[closestIndex] || 0;
  
  // frequencyDataを更新（コピーを作成）
  if (analysisData.value.frequencyData[closestIndex]) {
    const sourceData = analysisData.value.frequencyData[closestIndex];
    // 既存のfrequencyDataがあれば同じサイズで再利用、なければ新規作成
    if (!frequencyData.value || frequencyData.value.length !== sourceData.length) {
      frequencyData.value = new Uint8Array(sourceData.length);
    }
    // データをコピー
    frequencyData.value.set(sourceData);
  } else {
    frequencyData.value = new Uint8Array(1024);
  }
};

// ボイスタイプ分析関連のハンドラ
const handleMultipleAudioFilesLoaded = (audioBuffers: Record<string, AudioBuffer>) => {
  console.log('複数の音声ファイルが読み込まれました:', Object.keys(audioBuffers));
};

const analyzeMultipleAudioFiles = async (audioBuffers: Record<string, AudioBuffer>, gender: string) => {
  try {
    analysisCompleted.value = false;
    
    console.log('複数の音声ファイルの分析を開始します');
    console.log(`性別: ${gender}`);
    
    // ピッチ検出サービスを初期化
    await pitchDetectionService.initialize();
    
    // ボイスタイプ分析サービスのインスタンスを作成
    const voiceTypeAnalysisService = new VoiceTypeAnalysisService();
    
    // 各音程ごとの分析データを保存するオブジェクト
    const pitchFrequencyDataArrays: Record<string, Uint8Array[]> = {};
    const pitchDataArrays: Record<string, number[]> = {};
    const timestampsArrays: Record<string, number[]> = {};
    
    // 各音程ごとに分析
    for (const [pitchId, buffer] of Object.entries(audioBuffers)) {
      console.log(`${pitchId}の分析を開始します`);
      
      const sampleRate = buffer.sampleRate;
      const bufferSize = 2048;
      const hopSize = 1024;
      const numFrames = Math.floor((buffer.length - bufferSize) / hopSize) + 1;
      
      // 分析用の一時バッファ
      const tempBuffer = new Float32Array(bufferSize);
      
      // 結果を保存する配列
      const pitchData: number[] = [];
      const frequencyDataArray: Uint8Array[] = [];
      const timestamps: number[] = [];
      
      // 各フレームを分析
      for (let i = 0; i < numFrames; i++) {
        // フレームの開始位置
        const startSample = i * hopSize;
        
        // フレームの時間（秒）
        const timestamp = startSample / sampleRate;
        
        // バッファにフレームのデータをコピー
        buffer.copyFromChannel(tempBuffer, 0, startSample);
        
        // ピッチを検出
        const pitch = pitchDetectionService.detectPitch(tempBuffer, sampleRate);
        
        // 周波数スペクトルを計算
        const spectrum = fourierTransform(tempBuffer);
        const frequencyData = new Uint8Array(spectrum.length);
        
        // スペクトルをdB単位に変換し、0-255の範囲にスケーリング
        for (let j = 0; j < spectrum.length; j++) {
          const magnitude = spectrum[j];
          // 0の場合はログが-Infinityになるので回避
          const dB = magnitude > 0 ? 20 * Math.log10(magnitude) : -100;
          const normalized = Math.max(0, Math.min(255, (dB + 100) * 2.55));
          frequencyData[j] = normalized;
        }
        
        // 結果を保存（コピーを作成して保存）
        pitchData.push(pitch);
        frequencyDataArray.push(new Uint8Array(frequencyData));
        timestamps.push(timestamp);
      }
      
      // 音程ごとの結果を保存
      pitchFrequencyDataArrays[pitchId] = frequencyDataArray;
      pitchDataArrays[pitchId] = pitchData;
      timestampsArrays[pitchId] = timestamps;
      
      console.log(`${pitchId}の分析完了: ${numFrames}フレーム`);
    }
    
    // ボイスタイプを分析
    const result = voiceTypeAnalysisService.analyzeMultiplePitches(
      pitchFrequencyDataArrays,
      pitchDataArrays,
      timestampsArrays,
      audioBuffers[Object.keys(audioBuffers)[0]].sampleRate,
      gender as 'male' | 'female'
    );
    
    // 結果を保存
    voiceTypeAnalysisResult.value = result;
    
    console.log('ボイスタイプ分析結果:', result);
    analysisCompleted.value = true;
  } catch (error) {
    console.error('ボイスタイプ分析に失敗しました:', error);
    alert('ボイスタイプ分析に失敗しました。');
  }
};

// コンポーネントがアンマウントされたときのクリーンアップ
onUnmounted(() => {
  // リソースを解放
  pitchDetectionService.dispose();
  audioService.dispose();
});
</script>

<style scoped>
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
