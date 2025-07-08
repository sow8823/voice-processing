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
        <v-card class="mb-6">
          <v-card-title class="text-center text-h4">リアルタイムピッチ検出と周波数特性</v-card-title>
          <v-card-subtitle class="text-center">マイクを使用して音声のピッチと周波数特性をリアルタイムで分析します</v-card-subtitle>
          
          <v-card-text class="text-center">
            <v-btn
              :color="isProcessing ? 'error' : 'primary'"
              size="large"
              @click="toggleAudio"
              :loading="isLoading"
              :prepend-icon="isProcessing ? 'mdi-stop' : 'mdi-microphone'"
            >
              {{ isProcessing ? '音声処理を終了' : '音声処理を開始' }}
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
        <VoiceTypeUploader
          @audio-loaded="handleMultipleAudioFilesLoaded"
          @analysis-requested="analyzeMultipleAudioFiles"
          @playback-started="handlePitchPlaybackStarted"
          @playback-time-updated="handlePlaybackTimeUpdated"
          @playback-ended="handlePlaybackEnded"
          @playback-stopped="handlePlaybackStopped"
          @seek-to-time="handleSeekToTime"
          :analysis-completed="analysisCompleted"
        />
        
        <!-- ボイスタイプ分析結果表示 -->
        <v-card v-if="voiceTypeAnalysisResult && activeTab === 'voicetype'" class="mt-6">
          <v-card-title class="text-center text-h5">
            <v-icon start icon="mdi-account-voice" class="mr-2"></v-icon>
            ボイスタイプ分析結果
          </v-card-title>
          
          <v-card-text>
            <v-row>
              <!-- 声質タイプの表示 -->
              <v-col cols="12" class="text-center">
                <div class="mb-2">
                  <v-chip
                    size="small"
                    color="primary"
                    class="mb-2"
                  >
                    <v-icon start>mdi-music-note</v-icon>
                    <span>分析音高: {{ selectedNote }} ({{ noteFrequencyMap[selectedNote] }} Hz)</span>
                  </v-chip>
                </div>
                
                <v-chip
                  size="x-large"
                  :color="getVoiceTypeColor(voiceTypeAnalysisResult.voiceType)"
                  class="pa-4 mb-4"
                >
                  <v-icon start>{{ getVoiceTypeIcon(voiceTypeAnalysisResult.voiceType) }}</v-icon>
                  <span class="text-h6">{{ getVoiceTypeName(voiceTypeAnalysisResult.voiceType) }}</span>
                </v-chip>
                
                <!-- 確信度表示 -->
                <div class="mt-2">
                  <span class="text-subtitle-1">確信度: {{ Math.round(voiceTypeAnalysisResult.confidence * 100) }}%</span>
                  <v-progress-linear
                    :model-value="voiceTypeAnalysisResult.confidence * 100"
                    :color="getVoiceTypeColor(voiceTypeAnalysisResult.voiceType)"
                    height="10"
                    rounded
                    class="mt-2"
                  ></v-progress-linear>
                </div>
              </v-col>
              
              <!-- パラメータ表示 -->
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="pa-4">
                  <v-card-title class="text-subtitle-1">
                    <v-icon start>mdi-chart-bar</v-icon>
                    分析パラメータ
                  </v-card-title>
                  
                  <v-list>
                    <v-list-item>
                      <template v-slot:prepend>
                        <v-icon>mdi-sine-wave</v-icon>
                      </template>
                      <v-list-item-title>第2倍音/基本周波数比率</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ Math.round(voiceTypeAnalysisResult.parameters.harmonic2Ratio) }}%
                        <v-progress-linear
                          :model-value="Math.min(100, voiceTypeAnalysisResult.parameters.harmonic2Ratio)"
                          color="primary"
                          height="5"
                          class="mt-1"
                        ></v-progress-linear>
                      </v-list-item-subtitle>
                    </v-list-item>
                    
                    <v-list-item>
                      <template v-slot:prepend>
                        <v-icon>mdi-sine-wave</v-icon>
                      </template>
                      <v-list-item-title>第3倍音/基本周波数比率</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ Math.round(voiceTypeAnalysisResult.parameters.harmonic3Ratio) }}%
                        <v-progress-linear
                          :model-value="Math.min(100, voiceTypeAnalysisResult.parameters.harmonic3Ratio)"
                          color="primary"
                          height="5"
                          class="mt-1"
                        ></v-progress-linear>
                      </v-list-item-subtitle>
                    </v-list-item>
                    
                    <v-list-item>
                      <template v-slot:prepend>
                        <v-icon>mdi-chart-bell-curve</v-icon>
                      </template>
                      <v-list-item-title>高周波数帯域エネルギー比率</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ Math.round(voiceTypeAnalysisResult.parameters.highFrequencyRatio * 100) }}%
                        <v-progress-linear
                          :model-value="voiceTypeAnalysisResult.parameters.highFrequencyRatio * 100"
                          color="primary"
                          height="5"
                          class="mt-1"
                        ></v-progress-linear>
                      </v-list-item-subtitle>
                    </v-list-item>
                    
                    <v-list-item>
                      <template v-slot:prepend>
                        <v-icon>mdi-waveform</v-icon>
                      </template>
                      <v-list-item-title>ノイズ成分の割合</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ Math.round(voiceTypeAnalysisResult.parameters.noiseRatio * 100) }}%
                        <v-progress-linear
                          :model-value="voiceTypeAnalysisResult.parameters.noiseRatio * 100"
                          color="primary"
                          height="5"
                          class="mt-1"
                        ></v-progress-linear>
                      </v-list-item-subtitle>
                    </v-list-item>

                    <!-- 新しいパラメータ（存在する場合のみ表示） -->
                    <v-list-item v-if="voiceTypeAnalysisResult.parameters.voiceConsistency !== undefined">
                      <template v-slot:prepend>
                        <v-icon>mdi-tune-vertical</v-icon>
                      </template>
                      <v-list-item-title>声質の一貫性</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ Math.round(voiceTypeAnalysisResult.parameters.voiceConsistency * 100) }}%
                        <v-progress-linear
                          :model-value="voiceTypeAnalysisResult.parameters.voiceConsistency * 100"
                          color="primary"
                          height="5"
                          class="mt-1"
                        ></v-progress-linear>
                      </v-list-item-subtitle>
                    </v-list-item>

                    <v-list-item v-if="voiceTypeAnalysisResult.parameters.voiceQualityChange !== undefined">
                      <template v-slot:prepend>
                        <v-icon>mdi-swap-vertical</v-icon>
                      </template>
                      <v-list-item-title>声質変化の度合い</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ Math.round(voiceTypeAnalysisResult.parameters.voiceQualityChange * 100) }}%
                        <v-progress-linear
                          :model-value="voiceTypeAnalysisResult.parameters.voiceQualityChange * 100"
                          color="primary"
                          height="5"
                          class="mt-1"
                        ></v-progress-linear>
                      </v-list-item-subtitle>
                    </v-list-item>

                    <v-list-item v-if="voiceTypeAnalysisResult.parameters.brightness3kHz !== undefined">
                      <template v-slot:prepend>
                        <v-icon>mdi-brightness-6</v-icon>
                      </template>
                      <v-list-item-title>3kHz周辺の強さ</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ Math.round(voiceTypeAnalysisResult.parameters.brightness3kHz * 100) }}%
                        <v-progress-linear
                          :model-value="voiceTypeAnalysisResult.parameters.brightness3kHz * 100"
                          color="primary"
                          height="5"
                          class="mt-1"
                        ></v-progress-linear>
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-list>
                </v-card>
              </v-col>
              
              <!-- 判定基準の説明 -->
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="pa-4">
                  <v-card-title class="text-subtitle-1">
                    <v-icon start>mdi-information-outline</v-icon>
                    ボイスタイプの特徴
                  </v-card-title>
                  
                  <v-tabs v-model="voiceTypeInfoTab">
                    <v-tab value="lightChest">ライトチェスト</v-tab>
                    <v-tab value="pull">プル</v-tab>
                    <v-tab value="flip">フリップ</v-tab>
                    <v-tab value="mixed">ミックス</v-tab>
                  </v-tabs>
                  
                  <v-window v-model="voiceTypeInfoTab" class="mt-2">
                    <v-window-item value="lightChest">
                      <v-list>
                        <v-list-item>
                          <v-list-item-title>息漏れが多い</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>基本周波数の振幅が他の倍音成分と比べて大きい</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>高周波数帯域のエネルギーが比較的少ない</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-window-item>
                    
                    <v-window-item value="pull">
                      <v-list>
                        <v-list-item>
                          <v-list-item-title>地声感が強い</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>倍音成分が基本周波数成分と同等以上の大きさがみられる</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>高周波数帯域にもエネルギーが分布している</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-window-item>

                    <v-window-item value="flip">
                      <v-list>
                        <v-list-item>
                          <v-list-item-title>低音と高音の間で声質が著しく変化する</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>低音では倍音が豊かで声量が大きい</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>高音では基音優位になり声量が小さくなる</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>特定の音程で声質が急激に変化する（ヨーデル的特徴）</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-window-item>

                    <v-window-item value="mixed">
                      <v-list>
                        <v-list-item>
                          <v-list-item-title>低音から高音まで声質の変化が少ない</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>全体的に声量が大きい</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>倍音成分が豊か</v-list-item-title>
                        </v-list-item>
                        <v-list-item>
                          <v-list-item-title>3kHz周辺の周波数成分が強く、明るく響く声</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-window-item>
                  </v-window>
                </v-card>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
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
import VoiceTypeUploader from "../molecules/VoiceTypeUploader.vue";
import fourierTransform from "fourier-transform";
import type { VoiceTypeAnalysisResult, VoiceType } from "../../services/VoiceTypeAnalysisService";
const activeTab = ref<string>("microphone");
const currentPitch = ref<number>(0);
const frequencyData = ref<Uint8Array>(new Uint8Array(1024));
const isProcessing = ref<boolean>(false);
const isLoading = ref<boolean>(false);
const animationFrameId = ref<number | null>(null);
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

// ボイスタイプ情報タブの状態
const voiceTypeInfoTab = ref<string>("lightChest");

// 検出された基音成分と倍音成分の周波数
const detectedBaseFrequency = ref<number | undefined>(undefined);
const detectedHarmonic2Frequency = ref<number | undefined>(undefined);
const detectedHarmonic3Frequency = ref<number | undefined>(undefined);

// 選択された音高の情報
const selectedNote = ref<string>("A4");

// 音高と周波数のマッピング
const noteFrequencyMap: Record<string, number> = {
  // A3 (57) から A5 (81) までの音高と周波数のマッピング
  "A3": 220.00,
  "A#3": 233.08,
  "B3": 246.94,
  "C4": 261.63,
  "C#4": 277.18,
  "D4": 293.66,
  "D#4": 311.13,
  "E4": 329.63,
  "F4": 349.23,
  "F#4": 369.99,
  "G4": 392.00,
  "G#4": 415.30,
  "A4": 440.00,
  "A#4": 466.16,
  "B4": 493.88,
  "C5": 523.25,
  "C#5": 554.37,
  "D5": 587.33,
  "D#5": 622.25,
  "E5": 659.25,
  "F5": 698.46,
  "F#5": 739.99,
  "G5": 783.99,
  "G#5": 830.61,
  "A5": 880.00
};

// 現在の再生位置
const currentPlaybackTime = ref<number>(0);

// タブ切り替え時の処理
watch(activeTab, (newTab, oldTab) => {
  console.log(`タブが切り替わりました: ${oldTab} -> ${newTab}`);
  
  // 前のタブの処理を終了
  if (oldTab === "microphone" && isProcessing.value) {
    // マイク入力の処理を終了
    stopAudio();
  } else if (oldTab === "file") {
    // ファイル入力の処理を終了
    stopFileAnalysis();
  }
  
  // データをリセット
  resetData();
});

// ボイスタイプ分析サービスのインスタンスを作成
const voiceTypeAnalysisService = new VoiceTypeAnalysisService();

// 複数の音声ファイルがロードされたときのハンドラ
const handleMultipleAudioFilesLoaded = (audioBuffers: Record<string, AudioBuffer>) => {
  console.log('複数の音声ファイルがロードされました:', Object.keys(audioBuffers));
  
  // 最初の音声バッファをfileAudioBufferに設定（表示用）
  const firstKey = Object.keys(audioBuffers)[0];
  if (firstKey) {
    fileAudioBuffer.value = audioBuffers[firstKey];
  }
};

// 複数の音声ファイルを分析するハンドラ
const analyzeMultipleAudioFiles = async (audioBuffers: Record<string, AudioBuffer>, gender: string) => {
  console.log(`複数の音声ファイルの分析を開始します (性別: ${gender})`);
  
  try {
    // 分析中フラグを設定
    isLoading.value = true;
    analysisCompleted.value = false;
    
    // 各音声ファイルの周波数データとピッチデータを取得
    const frequencyDataArrays: Record<string, Uint8Array[]> = {};
    const pitchDataArrays: Record<string, number[]> = {};
    const timestampsArrays: Record<string, number[]> = {};
    
    // 各音声ファイルを処理
    for (const [pitchId, buffer] of Object.entries(audioBuffers)) {
      const { frequencyDataArray, pitchDataArray, timestamps } = await processAudioBuffer(buffer);
      
      frequencyDataArrays[pitchId] = frequencyDataArray;
      pitchDataArrays[pitchId] = pitchDataArray;
      timestampsArrays[pitchId] = timestamps;
      
      // 最初の音声ファイルの分析データを表示用に設定
      if (Object.keys(frequencyDataArrays).length === 1) {
        analysisData.value = {
          frequencyData: frequencyDataArray,
          pitchData: pitchDataArray,
          timestamps
        };
      }
    }
    
    // サンプリングレートを取得（最初の音声ファイルから）
    const firstBuffer = audioBuffers[Object.keys(audioBuffers)[0]];
    const sampleRate = firstBuffer ? firstBuffer.sampleRate : 44100;
    
    // ボイスタイプ分析を実行
    const result = voiceTypeAnalysisService.analyzeMultiplePitches(
      frequencyDataArrays,
      pitchDataArrays,
      timestampsArrays,
      sampleRate,
      gender as 'male' | 'female'
    );
    
    // 分析結果を設定
    voiceTypeAnalysisResult.value = result;
    
    // 分析完了フラグを設定
    analysisCompleted.value = true;
    
    console.log('ボイスタイプ分析が完了しました:', result.voiceType);
  } catch (error) {
    console.error('音声分析中にエラーが発生しました:', error);
    alert('音声分析に失敗しました。');
  } finally {
    isLoading.value = false;
  }
};

// 特定の音程の再生が開始されたときのハンドラ
const handlePitchPlaybackStarted = (pitchId: string, currentTime: number) => {
  console.log(`音程 ${pitchId} の再生が開始されました (${currentTime}秒)`);
  
  // 再生中フラグは VoiceTypeUploader コンポーネント内で管理されるため、ここでは設定しない
  
  // 現在の再生位置を更新
  currentPlaybackTime.value = currentTime;
};

// 音声バッファを処理して周波数データとピッチデータを取得する関数
const processAudioBuffer = async (buffer: AudioBuffer): Promise<{
  frequencyData: Uint8Array;
  frequencyDataArray: Uint8Array[];
  pitchDataArray: number[];
  timestamps: number[];
}> => {
  // 処理結果を格納する配列
  const frequencyDataArray: Uint8Array[] = [];
  const pitchDataArray: number[] = [];
  const timestamps: number[] = [];
  
  // バッファからデータを取得
  const audioData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  // 分析フレームサイズとホップサイズを設定
  const frameSize = 2048;
  const hopSize = 1024;
  
  // 各フレームを処理
  for (let i = 0; i < audioData.length - frameSize; i += hopSize) {
    // フレームを抽出
    const frame = audioData.slice(i, i + frameSize);
    
    // ピッチを検出
    const pitch = pitchDetectionService.detectPitch(
      new Float32Array(frame),
      sampleRate,
      { powerThreshold: 0.001, clarityThreshold: 0.7 }
    );
    
    // 周波数データを計算
    const fftResult = fourierTransform(frame);
    const frequencyData = new Uint8Array(fftResult.length);
    
    // FFT結果を0-255の範囲にスケーリング
    for (let j = 0; j < fftResult.length; j++) {
      frequencyData[j] = Math.min(255, Math.max(0, Math.floor(fftResult[j] * 5000)));
    }
    
    // 結果を配列に追加
    frequencyDataArray.push(frequencyData);
    pitchDataArray.push(pitch);
    timestamps.push(i / sampleRate);
  }
  
  // 最初のフレームの周波数データを返す（表示用）
  const firstFrameData = frequencyDataArray.length > 0
    ? frequencyDataArray[0]
    : new Uint8Array(1024);
    
  return {
    frequencyData: firstFrameData,
    frequencyDataArray: frequencyDataArray,
    pitchDataArray: pitchDataArray,
    timestamps: timestamps
  };
};

// ボイスタイプに応じた色を返す関数
const getVoiceTypeColor = (voiceType: VoiceType): string => {
  switch (voiceType) {
    case 'lightChest':
      return 'light-blue';
    case 'pull':
      return 'deep-purple';
    case 'flip':
      return 'amber-darken-2';
    case 'mixed':
      return 'green';
    default:
      return 'grey';
  }
};

// ボイスタイプに応じたアイコンを返す関数
const getVoiceTypeIcon = (voiceType: VoiceType): string => {
  switch (voiceType) {
    case 'lightChest':
      return 'mdi-air';
    case 'pull':
      return 'mdi-weight-lifter';
    case 'flip':
      return 'mdi-swap-vertical';
    case 'mixed':
      return 'mdi-tune-vertical';
    default:
      return 'mdi-help-circle';
  }
};

// ボイスタイプに応じた日本語名を返す関数
const getVoiceTypeName = (voiceType: VoiceType): string => {
  switch (voiceType) {
    case 'lightChest':
      return 'ライトチェスト';
    case 'pull':
      return 'プル';
    case 'flip':
      return 'フリップ';
    case 'mixed':
      return 'ミックス';
    default:
      return '不明';
  }
};

// データをリセットする関数
const resetData = () => {

  currentPitch.value = 0;
  frequencyData.value = new Uint8Array(1024);
};

// 音声処理を開始/終了するトグル関数
const toggleAudio = async () => {
  if (isProcessing.value) {
    // 処理中なら停止
    stopAudio();
  } else {
    // 停止中なら開始
    startAudio();
  }
};

// 音声処理を開始する関数
const startAudio = async () => {
  isLoading.value = true;
  
  try {
    // リアルタイムヒートマップをリセット
    if (realtimeHeatMapCanvasRef.value) {
      realtimeHeatMapCanvasRef.value.resetHeatmap();
    }
    
    // ピッチ検出サービスを初期化
    await pitchDetectionService.initialize();
    console.log('ピッチ検出サービスを初期化しました');
    
    // 音声サービスを初期化
    await audioService.initialize();
    console.log('音声サービスを初期化しました');
    
    // FFTサイズを設定
    const bufferSize = 2048;
    audioService.setFFTSize(bufferSize);
    
    // オーディオバッファを作成
    const audioBuffer = new Float32Array(bufferSize);
    frequencyData.value = new Uint8Array(audioService.getFrequencyBinCount());
    
    // サンプリングレートを取得
    const sampleRate = audioService.getSampleRate();
    console.log(`サンプリングレート: ${sampleRate}Hz`);
    
    // 閾値の設定
    const powerThreshold = 0.001;
    const clarityThreshold = 0.7;
    
    // 更新関数
    const update = () => {
      try {
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
        if (isProcessing.value) {
          animationFrameId.value = requestAnimationFrame(update);
        }
      } catch (frameError) {
        console.error('フレーム分析中にエラーが発生しました:', frameError);
        stopAudio();
      }
    };
    
    // 処理中フラグを設定
    isProcessing.value = true;
    
    // 更新を開始
    console.log('リアルタイム分析を開始します');
    update();
  } catch (error) {
    console.error('音声処理の開始に失敗しました:', error);
    alert('マイクへのアクセスが拒否されたか、エラーが発生しました。');
  } finally {
    isLoading.value = false;
  }
};

// 音声処理を停止する関数
const stopAudio = () => {
  console.log('リアルタイム分析を停止します');
  
  // アニメーションフレームをキャンセル
  if (animationFrameId.value !== null) {
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
  
  // リソースを解放
  audioService.dispose();
  
  // 処理中フラグをリセット
  isProcessing.value = false;
  
  // データをリセット
  resetData();
  
  console.log('リアルタイム分析を停止しました');
};


// コンポーネントがアンマウントされたときにリソースを解放
onUnmounted(() => {
  // アニメーションフレームをキャンセル
  if (animationFrameId.value !== null) {
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
  
  // リソースを解放
  audioService.dispose();
  pitchDetectionService.dispose();
  
  // 処理中フラグをリセット
  isProcessing.value = false;
  
  console.log('コンポーネントがアンマウントされました');
});

// ファイルがアップロードされたときの処理
const handleAudioFileLoaded = (audioBuffer: AudioBuffer) => {
  fileAudioBuffer.value = audioBuffer;
  console.log('音声ファイルが読み込まれました:', audioBuffer);
};

// ファイルの分析リクエストがあったときの処理
const analyzeAudioFile = async (audioBuffer: AudioBuffer, note?: string) => {
  // 音高が指定されている場合は更新
  if (note) {
    selectedNote.value = note;
    console.log(`選択された音高を更新: ${selectedNote.value} (${noteFrequencyMap[selectedNote.value]} Hz)`);
  }
  if (!audioBuffer) {
    console.error('音声バッファが空です');
    return;
  }
  
  console.log('音声ファイルの分析を開始します', {
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels
  });
  
  // 分析完了フラグをリセット
  analysisCompleted.value = false;
  
  // ボイスタイプ分析結果をリセット
  voiceTypeAnalysisResult.value = null;
  
  try {
    // 分析データをリセット
    analysisData.value = {
      pitchData: [],
      frequencyData: [],
      timestamps: []
    };
    
    // ピッチ検出サービスを初期化
    await pitchDetectionService.initialize();
    console.log('ピッチ検出サービスを初期化しました');
    
    // バッファサイズを設定
    const bufferSize = 2048;
    
    // サンプリングレートを取得
    const sampleRate = audioBuffer.sampleRate;
    console.log(`サンプリングレート: ${sampleRate}Hz`);
    
    // FFTサイズを設定
    const fftSize = bufferSize * 2;
    const frequencyBinCount = fftSize / 2;
    console.log(`周波数ビン数: ${frequencyBinCount}`);
    
    // 閾値の設定
    const powerThreshold = 0.001;
    const clarityThreshold = 0.7;
    
    // 分析用の一時バッファ
    const tempBuffer = new Float32Array(bufferSize);
    
    // 時間的平滑化のための前回のフレームデータを保持する配列
    let previousFrequencyData: Uint8Array | null = null;
    
    try {
      // 音声ファイルの長さを取得
      const duration = audioBuffer.duration;
      
      // 120frame/sの粒度で分析（ユーザー指定）
      const frameInterval = 1 / 120; // 秒単位のフレーム間隔
      const totalFrames = Math.ceil(duration / frameInterval);
      
      console.log(`分析フレーム数: ${totalFrames} (${frameInterval}秒間隔)`);
      
      // 進捗表示用
      const progressStep = Math.max(1, Math.floor(totalFrames / 100));
      
      // オフライン分析用のコンテキスト
      const offlineContext = new OfflineAudioContext(1, bufferSize, sampleRate);
      const offlineAnalyser = offlineContext.createAnalyser();
      offlineAnalyser.fftSize = fftSize;
      
      // 各フレームを分析
      for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame * frameInterval;
        
        // 現在の時間位置のオーディオデータを取得
        const startSample = Math.floor(currentTime * sampleRate);
        
        // バッファをクリア
        tempBuffer.fill(0);
        
        // オーディオデータをコピー（チャンネル0のみ使用）
        for (let i = 0; i < bufferSize; i++) {
          const sampleIndex = startSample + i;
          if (sampleIndex < audioBuffer.length) {
            tempBuffer[i] = audioBuffer.getChannelData(0)[sampleIndex];
          }
        }
        
        // 周波数データを取得
        const currentFrequencyData = new Uint8Array(frequencyBinCount);
        
        // fourier-transformライブラリを使用して正確なFFT計算を行う
        
        // 窓関数（ブラックマン窓）を適用 - ハミング窓よりもスペクトル漏れが少ない
        const windowedBuffer = new Float32Array(bufferSize);
        for (let i = 0; i < bufferSize; i++) {
          // ブラックマン窓: 0.42 - 0.5 * cos(2π * i / (N-1)) + 0.08 * cos(4π * i / (N-1))
          const windowValue = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (bufferSize - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (bufferSize - 1));
          windowedBuffer[i] = tempBuffer[i] * windowValue;
        }
        
        // FFT計算を実行
        const fftResult = fourierTransform(windowedBuffer);
        
        // FFT結果は複素数の絶対値（マグニチュード）の配列
        // これを0-255の範囲にスケーリングしてUint8Arrayに変換
        
        // 最大値を見つける
        let maxMagnitude = 0;
        for (let i = 0; i < fftResult.length; i++) {
          if (fftResult[i] > maxMagnitude) {
            maxMagnitude = fftResult[i];
          }
        }
        
        // 一時的な周波数データを作成
        const tempFrequencyData = new Uint8Array(frequencyBinCount);
        
        // 0-255の範囲にスケーリング - パラメータを調整して低振幅信号の強調を抑制
        for (let i = 0; i < Math.min(fftResult.length, frequencyBinCount); i++) {
          // 対数スケールでスケーリング（人間の聴覚特性に近い）- 係数を100に調整
          const scaledValue = Math.log10(1 + fftResult[i] * 100) / Math.log10(1 + maxMagnitude * 100) * 255;
          tempFrequencyData[i] = Math.min(255, Math.max(0, Math.floor(scaledValue)));
        }
        
        // 周波数的平滑化の強化 - より広い範囲での移動平均
        const smoothingFactor = 3; // 平滑化の強さを増加
        for (let i = 0; i < frequencyBinCount; i++) {
          let sum = 0;
          let count = 0;
          
          // 周囲のビンの値を平均化
          for (let j = Math.max(0, i - smoothingFactor); j <= Math.min(frequencyBinCount - 1, i + smoothingFactor); j++) {
            sum += tempFrequencyData[j];
            count++;
          }
          
          currentFrequencyData[i] = Math.floor(sum / count);
        }
        
        // 時間的平滑化の追加 - 前回のフレームデータがあれば平均化
        if (previousFrequencyData) {
          const temporalSmoothingFactor = 0.7; // 時間的平滑化の強さ (0.0-1.0)
          for (let i = 0; i < frequencyBinCount; i++) {
            currentFrequencyData[i] = Math.floor(
              previousFrequencyData[i] * temporalSmoothingFactor +
              currentFrequencyData[i] * (1 - temporalSmoothingFactor)
            );
          }
        }
        
        // 現在のデータを次回の平滑化のために保存
        previousFrequencyData = new Uint8Array(currentFrequencyData);
        
        if (frame % 30 === 0) { // ログ出力を減らす
          console.log(`フレーム ${frame}: FFT計算完了 (最大値: ${maxMagnitude.toFixed(6)})`);
        }
        
        // ピッチを検出
        const pitch = pitchDetectionService.detectPitch(
          tempBuffer,
          sampleRate,
          { powerThreshold, clarityThreshold }
        );
        
        // 分析データを保存
        analysisData.value.timestamps.push(currentTime);
        analysisData.value.pitchData.push(pitch);
        // 周波数データのディープコピーを作成して保存
        const frequencyDataCopy = new Uint8Array(currentFrequencyData.length);
        for (let i = 0; i < currentFrequencyData.length; i++) {
          frequencyDataCopy[i] = currentFrequencyData[i];
        }
        analysisData.value.frequencyData.push(frequencyDataCopy);
        
        // デバッグ用：周波数データの最大値を確認
        const maxFreq = Math.max(...Array.from(frequencyDataCopy));
        if (frame % progressStep === 0) {
          console.log(`フレーム ${frame} の周波数データ最大値: ${maxFreq}`);
        }
        
        // 進捗表示
        if (frame % progressStep === 0) {
          console.log(`分析進捗: ${Math.round((frame / totalFrames) * 100)}%`);
        }
      }
      
      console.log('分析が完了しました', {
        frames: analysisData.value.timestamps.length,
        duration: analysisData.value.timestamps[analysisData.value.timestamps.length - 1],
        frequency_data: analysisData.value.frequencyData,
        pitch_data: analysisData.value.pitchData,
        timestamps: analysisData.value.timestamps
      });
      
      // 分析完了後、表示はリセットしておく
      currentPitch.value = 0;
      frequencyData.value = new Uint8Array(frequencyBinCount);
      
      // ファイル分析ヒートマップをリセット（分析データを表示するため）
      if (fileHeatMapCanvasRef.value) {
        fileHeatMapCanvasRef.value.resetHeatmap();
      }
      
      // ボイスタイプ分析を実行
      if (activeTab.value === 'voicetype') {
        console.log(`ボイスタイプ分析を実行します (選択音高: ${selectedNote.value}, ${noteFrequencyMap[selectedNote.value]} Hz)`);
        
        try {
          // 選択された音高の周波数を取得
          const targetFrequency = noteFrequencyMap[selectedNote.value];
          
          // 検出に使用する周波数データと時間位置を特定
          // 安定した部分（中央付近）のデータを使用
          const stableIndex = Math.floor(analysisData.value.frequencyData.length / 2);
          const stableFrequencyData = analysisData.value.frequencyData[stableIndex];
          
          // 選択した周波数の±5%以内で最も強いスペクトル成分を見つける（基音）
          detectedBaseFrequency.value = voiceTypeAnalysisService.findStrongestFrequencyComponent(
            stableFrequencyData,
            targetFrequency,
            sampleRate,
            0.05 // 5%の範囲
          );
          
          // 選択した周波数の2倍の±5%以内で最も強い成分を見つける（2倍音）
          detectedHarmonic2Frequency.value = voiceTypeAnalysisService.findStrongestFrequencyComponent(
            stableFrequencyData,
            targetFrequency * 2, // 選択した周波数の2倍
            sampleRate,
            0.05 // 5%の範囲
          );
          
          // 選択した周波数の3倍の±5%以内で最も強い成分を見つける（3倍音）
          detectedHarmonic3Frequency.value = voiceTypeAnalysisService.findStrongestFrequencyComponent(
            stableFrequencyData,
            targetFrequency * 3, // 選択した周波数の3倍
            sampleRate,
            0.05 // 5%の範囲
          );
          
          console.log(`選択周波数: ${targetFrequency.toFixed(2)}Hz`);
          console.log(`検出された基音成分: ${detectedBaseFrequency.value?.toFixed(2) || 'N/A'}Hz (選択周波数の±5%以内)`);
          console.log(`検出された第2倍音成分: ${detectedHarmonic2Frequency.value?.toFixed(2) || 'N/A'}Hz (選択周波数の2倍の±5%以内)`);
          console.log(`検出された第3倍音成分: ${detectedHarmonic3Frequency.value?.toFixed(2) || 'N/A'}Hz (選択周波数の3倍の±5%以内)`);
          
          // ボイスタイプ分析を実行（選択された音高の情報を渡す）
          voiceTypeAnalysisResult.value = voiceTypeAnalysisService.analyzeVoiceType(
            analysisData.value.frequencyData,
            analysisData.value.pitchData,
            analysisData.value.timestamps,
            sampleRate,
            targetFrequency
          );
          
          console.log('ボイスタイプ分析結果:', voiceTypeAnalysisResult.value);
        } catch (error) {
          console.error('ボイスタイプ分析に失敗しました:', error);
        }
      }
      
      // 分析完了フラグを設定
      analysisCompleted.value = true;
      
    } catch (error) {
      console.error('音声ファイルの分析に失敗しました:', error);
      throw error;
    }
  } catch (error) {
    console.error('音声ファイルの分析に失敗しました:', error);
    alert('音声ファイルの分析に失敗しました。');
    analysisCompleted.value = false;
  }
};

// ファイル分析を停止する関数（共通処理）
const stopFileAnalysis = () => {
  console.log('ファイル分析を停止します');
  
  // アニメーションフレームをキャンセル
  if (animationFrameId.value !== null) {
    console.log('アニメーションフレームをキャンセルします');
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
  
  // ピッチと周波数データをリセット
  currentPitch.value = 0;
  frequencyData.value = new Uint8Array(frequencyData.value.length);
  currentPlaybackTime.value = 0;
  
  // リソースを解放
  audioService.dispose();
  
  console.log('分析データをリセットしました');
};

// 再生開始時の処理
const handlePlaybackStarted = (currentTime: number) => {
  console.log('再生が開始されました', { currentTime });
  currentPlaybackTime.value = currentTime;
  
  // 初期表示用にデータを設定
  updateDisplayWithCurrentTime(currentTime);
  
  // 再生開始時はヒートマップをリセットしない（分析データを表示したまま）
};

// 再生時間更新時の処理（スライダーからの更新）
const handlePlaybackTimeUpdated = (currentTime: number) => {
  currentPlaybackTime.value = currentTime;
  
  // スライダーの位置に合わせて表示を更新
  updateDisplayWithCurrentTime(currentTime);
  
  // ファイル分析ヒートマップのスクロール位置を再生位置に合わせて自動調整
  if (fileHeatMapCanvasRef.value && analysisCompleted.value) {
    fileHeatMapCanvasRef.value.adjustScrollToPlaybackTime(currentTime);
  }
  
  console.log(`スライダー位置更新: ${currentTime}秒 (${Math.round(currentTime * 120)}分割)`);
};

// スライダーでシーク時の処理
const handleSeekToTime = (seekTime: number) => {
  console.log(`スライダーシーク: ${seekTime}秒 (${Math.round(seekTime * 120)}分割)`);
  currentPlaybackTime.value = seekTime;
  
  // シーク位置に合わせて表示を更新
  updateDisplayWithCurrentTime(seekTime);
  
  // ファイル分析ヒートマップのスクロール位置を再生位置に合わせて自動調整
  if (fileHeatMapCanvasRef.value && analysisCompleted.value) {
    fileHeatMapCanvasRef.value.adjustScrollToPlaybackTime(seekTime);
  }
};

// 再生終了時の処理
const handlePlaybackEnded = () => {
  console.log('再生が終了しました');
  currentPlaybackTime.value = 0;
  
  // 表示をリセット
  currentPitch.value = 0;
  frequencyData.value = new Uint8Array(frequencyData.value.length);
};

// 再生停止時の処理
const handlePlaybackStopped = () => {
  console.log('再生が停止されました');
  currentPlaybackTime.value = 0;
  
  // 表示をリセット
  currentPitch.value = 0;
  frequencyData.value = new Uint8Array(frequencyData.value.length);
};

// タブ切り替えや新しいファイルがロードされたときに分析完了フラグと関連値をリセット
watch([activeTab, fileAudioBuffer], () => {
  analysisCompleted.value = false;
  
  // タブ切り替え時に周波数関連の値をリセット
  currentPitch.value = 0;
  detectedBaseFrequency.value = undefined;
  detectedHarmonic2Frequency.value = undefined;
  detectedHarmonic3Frequency.value = undefined;
  
  console.log('タブ切り替えまたはファイル変更: 分析データと周波数値をリセットしました');
});

// 現在の再生時間に合わせて表示を更新する関数
const updateDisplayWithCurrentTime = (currentTime: number) => {
  if (analysisData.value.timestamps.length === 0) return;
  
  // 現在の時間に最も近いフレームのインデックスを検索
  let closestIndex = 0;
  let minTimeDiff = Number.MAX_VALUE;
  
  for (let i = 0; i < analysisData.value.timestamps.length; i++) {
    const timeDiff = Math.abs(analysisData.value.timestamps[i] - currentTime);
    if (timeDiff < minTimeDiff) {
      minTimeDiff = timeDiff;
      closestIndex = i;
    }
  }
  
  // 見つかったフレームのデータを表示
  if (closestIndex >= 0 && closestIndex < analysisData.value.pitchData.length) {
    currentPitch.value = analysisData.value.pitchData[closestIndex];
  }
  
  if (closestIndex >= 0 && closestIndex < analysisData.value.frequencyData.length) {
    // 保存された周波数データのディープコピーを作成
    const savedFrequencyData = analysisData.value.frequencyData[closestIndex];
    
    // デバッグ用：周波数データの最大値を確認
    const maxFreq = Math.max(...Array.from(savedFrequencyData));
    console.log(`時間 ${currentTime}秒 の周波数データ最大値: ${maxFreq}`);
    
    // 新しいUint8Arrayを作成してデータをコピー
    frequencyData.value = new Uint8Array(savedFrequencyData.length);
    for (let i = 0; i < savedFrequencyData.length; i++) {
      frequencyData.value[i] = savedFrequencyData[i];
    }
  }
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
