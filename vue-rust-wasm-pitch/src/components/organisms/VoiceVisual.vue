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
            <SpectrumCanvas :frequencyData="frequencyData" :base-frequency="currentPitch" />
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
import RealtimeHeatMapCanvas from "../atoms/RealtimeHeatMapCanvas.vue";
import FileHeatMapCanvas from "../atoms/FileHeatMapCanvas.vue";
import AudioFileUploader from "../molecules/AudioFileUploader.vue";
import VoiceTypeUploader from "../molecules/VoiceTypeUploader.vue";
import fourierTransform from "fourier-transform";
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
const analyzeAudioFile = async (audioBuffer: AudioBuffer) => {
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

// タブ切り替えや新しいファイルがロードされたときに分析完了フラグをリセット
watch([activeTab, fileAudioBuffer], () => {
  analysisCompleted.value = false;
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
