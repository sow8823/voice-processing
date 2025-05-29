# 音声分析・可視化システム 実装詳細

## 現状の問題点の詳細分析

### 1. 再生バーと分析結果の同期問題

現在の実装では、標準HTML5の`<audio>`要素を使用して音声を再生しています。この要素は`timeupdate`イベントを発火して再生位置を通知しますが、このイベントの発火頻度は約3-4fpsと低頻度です。

```javascript
// 現在の実装（AudioFileUploader.vue）
const handleTimeUpdate = () => {
  if (audioPlayer.value && isPlaying.value) {
    emit('playback-time-updated', audioPlayer.value.currentTime);
  }
};
```

一方、分析データは240fpsという高頻度で保存されています：

```javascript
// 分析時の実装（VoiceVisual.vue）
const frameInterval = 1 / 240; // 秒単位のフレーム間隔
```

この頻度の差により、再生中の表示がかくついてしまいます。

### 2. 検索アルゴリズムの非効率性

現在の実装では、再生位置に対応するフレームを線形探索（O(n)の計算量）で検索しています：

```javascript
// 現在の実装（VoiceVisual.vue）
let closestIndex = 0;
let minTimeDiff = Number.MAX_VALUE;

for (let i = 0; i < analysisData.value.timestamps.length; i++) {
  const timeDiff = Math.abs(analysisData.value.timestamps[i] - currentTime);
  if (timeDiff < minTimeDiff) {
    minTimeDiff = timeDiff;
    closestIndex = i;
  }
}
```

240fpsのデータでは、1分の音声で14,400フレームものデータが生成されるため、この線形探索は非効率です。

## 改善案の詳細実装

### 1. カスタム再生コントロールの実装

#### 1.1 Web Audio APIを使用した再生システム

標準の`<audio>`要素を削除し、Web Audio APIを使用して音声を再生します：

```javascript
// AudioFileUploader.vue
const playAudio = async () => {
  if (!audioBuffer.value || !isAnalyzed.value) return;
  
  try {
    // AudioContextが停止していれば再開
    if (audioContext.value?.state === 'suspended') {
      await audioContext.value.resume();
    }
    
    // 既存のソースがあれば停止
    if (audioSource.value) {
      audioSource.value.stop();
      audioSource.value = null;
    }
    
    // 新しいソースを作成
    audioSource.value = audioContext.value!.createBufferSource();
    audioSource.value.buffer = audioBuffer.value;
    
    // ゲインノードを作成（音量調整用）
    gainNode.value = audioContext.value!.createGain();
    gainNode.value.gain.value = 1.0; // 音量を最大に設定
    
    // 接続: ソース -> ゲイン -> 出力
    audioSource.value.connect(gainNode.value);
    gainNode.value.connect(audioContext.value!.destination);
    
    // 再生開始時間を記録
    startTime.value = audioContext.value!.currentTime - pausedAt.value;
    
    // 再生を開始
    audioSource.value.start(0, pausedAt.value);
    
    // 状態を更新
    isPlaying.value = true;
    
    // 再生開始イベントを発火
    emit('playback-started', currentTime.value);
    
    // アニメーションフレームで再生位置を更新
    updatePlaybackPosition();
  } catch (error) {
    console.error('音声再生に失敗しました:', error);
  }
};
```

#### 1.2 requestAnimationFrameを使用した高頻度更新

再生位置の更新に`requestAnimationFrame`を使用して、約60fpsの更新頻度を実現します：

```javascript
// AudioFileUploader.vue
const updatePlaybackPosition = () => {
  if (!isPlaying.value || !audioContext.value || !audioBuffer.value) return;
  
  // 現在の再生位置を計算
  currentTime.value = audioContext.value.currentTime - startTime.value;
  
  // 再生が終了したかチェック
  if (currentTime.value >= audioBuffer.value.duration) {
    handleAudioEnded();
    return;
  }
  
  // 進捗率を計算
  progressPercentage.value = (currentTime.value / duration.value) * 100;
  
  // 再生位置更新イベントを発火
  emit('playback-time-updated', currentTime.value);
  
  // 次のフレームを要求
  animationFrameId.value = requestAnimationFrame(updatePlaybackPosition);
};
```

#### 1.3 カスタムUIの実装

標準の`<audio>`要素の代わりに、カスタムUIを実装します：

```html
<!-- AudioFileUploader.vue -->
<div class="custom-player">
  <div class="timeline-container">
    <div class="timeline" ref="timelineRef" @click="seekAudio">
      <div class="progress" :style="{ width: `${progressPercentage}%` }"></div>
      <div class="playhead" :style="{ left: `${progressPercentage}%` }"></div>
    </div>
    <div class="time-display">
      <span>{{ formatTime(currentTime) }}</span>
      <span>{{ formatTime(duration) }}</span>
    </div>
  </div>
  
  <div class="controls">
    <v-btn
      icon
      :color="isPlaying ? 'error' : 'primary'"
      @click="togglePlayback"
      :disabled="!audioUrl || !isAnalyzed"
    >
      <v-icon>{{ isPlaying ? 'mdi-pause' : 'mdi-play' }}</v-icon>
    </v-btn>
    <v-btn
      icon
      color="primary"
      @click="stopAudio"
      :disabled="!audioUrl || !isAnalyzed || !isPlaying"
    >
      <v-icon>mdi-stop</v-icon>
    </v-btn>
  </div>
</div>
```

#### 1.4 シーク機能の実装

タイムラインをクリックして再生位置を変更する機能を実装します：

```javascript
// AudioFileUploader.vue
const seekAudio = (event: MouseEvent) => {
  if (!timelineRef.value || !audioBuffer.value) return;
  
  const rect = timelineRef.value.getBoundingClientRect();
  const clickPosition = (event.clientX - rect.left) / rect.width;
  const seekTime = clickPosition * duration.value;
  
  // 再生位置を更新
  currentTime.value = seekTime;
  pausedAt.value = seekTime;
  progressPercentage.value = clickPosition * 100;
  
  // 再生中なら、現在の再生を停止して新しい位置から再開
  if (isPlaying.value) {
    if (audioSource.value) {
      audioSource.value.stop();
      audioSource.value = null;
    }
    playAudio();
  }
  
  // 再生位置更新イベントを発火
  emit('playback-time-updated', currentTime.value);
};
```

### 2. データ検索アルゴリズムの最適化

#### 2.1 二分探索アルゴリズムの実装

線形探索（O(n)）を二分探索（O(log n)）に置き換えて、検索効率を大幅に向上させます：

```javascript
// VoiceVisual.vue
const updateDisplayWithCurrentTime = (currentTime: number) => {
  if (analysisData.value.timestamps.length === 0) return;
  
  // 二分探索で現在の時間に最も近いフレームのインデックスを効率的に検索
  const targetIndex = binarySearchClosestTime(analysisData.value.timestamps, currentTime);
  
  // 見つかったフレームのデータを表示
  if (targetIndex >= 0 && targetIndex < analysisData.value.pitchData.length) {
    currentPitch.value = analysisData.value.pitchData[targetIndex];
  }
  
  if (targetIndex >= 0 && targetIndex < analysisData.value.frequencyData.length) {
    frequencyData.value = analysisData.value.frequencyData[targetIndex];
  }
};

// 二分探索で最も近い時間のインデックスを検索する関数
const binarySearchClosestTime = (timestamps: number[], targetTime: number): number => {
  if (timestamps.length === 0) return -1;
  
  // 範囲外の場合は端の値を返す
  if (targetTime <= timestamps[0]) return 0;
  if (targetTime >= timestamps[timestamps.length - 1]) return timestamps.length - 1;
  
  let left = 0;
  let right = timestamps.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    
    if (timestamps[mid] === targetTime) {
      return mid; // 完全一致
    }
    
    if (timestamps[mid] < targetTime) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  // 最も近い値を返す
  const leftValue = timestamps[right];
  const rightValue = timestamps[left];
  
  return Math.abs(leftValue - targetTime) < Math.abs(rightValue - targetTime) ? right : left;
};
```

#### 2.2 キャッシュ機構の導入（オプション）

頻繁にアクセスされる時間範囲のデータをキャッシュすることで、さらに検索を最適化できます：

```javascript
// VoiceVisual.vue
// 最近アクセスされたフレームをキャッシュ
const frameCache = ref<{
  time: number;
  index: number;
  timestamp: number;
} | null>(null);

const updateDisplayWithCurrentTime = (currentTime: number) => {
  if (analysisData.value.timestamps.length === 0) return;
  
  // キャッシュを確認
  let targetIndex: number;
  if (frameCache.value && Math.abs(frameCache.value.time - currentTime) < 0.01) {
    // キャッシュヒット
    targetIndex = frameCache.value.index;
  } else {
    // キャッシュミス - 二分探索
    targetIndex = binarySearchClosestTime(analysisData.value.timestamps, currentTime);
    
    // キャッシュを更新
    frameCache.value = {
      time: currentTime,
      index: targetIndex,
      timestamp: analysisData.value.timestamps[targetIndex]
    };
  }
  
  // 見つかったフレームのデータを表示
  if (targetIndex >= 0 && targetIndex < analysisData.value.pitchData.length) {
    currentPitch.value = analysisData.value.pitchData[targetIndex];
  }
  
  if (targetIndex >= 0 && targetIndex < analysisData.value.frequencyData.length) {
    frequencyData.value = analysisData.value.frequencyData[targetIndex];
  }
};
```

### 3. アーキテクチャの再設計

#### 3.1 状態管理の一元化

Vuexやpiniaなどの状態管理ライブラリを使用して、音声データと分析結果の状態を一元管理します：

```javascript
// stores/audioStore.ts
import { defineStore } from 'pinia';

export const useAudioStore = defineStore('audio', {
  state: () => ({
    audioBuffer: null,
    analysisData: {
      pitchData: [],
      frequencyData: [],
      timestamps: []
    },
    currentTime: 0,
    isPlaying: false,
    isAnalyzed: false,
    duration: 0
  }),
  
  actions: {
    setAudioBuffer(buffer) {
      this.audioBuffer = buffer;
      this.duration = buffer ? buffer.duration : 0;
    },
    
    setAnalysisData(data) {
      this.analysisData = data;
      this.isAnalyzed = true;
    },
    
    updateCurrentTime(time) {
      this.currentTime = time;
    },
    
    setPlayingState(isPlaying) {
      this.isPlaying = isPlaying;
    }
  },
  
  getters: {
    getCurrentFrameData: (state) => {
      if (!state.isAnalyzed || state.analysisData.timestamps.length === 0) {
        return { pitch: 0, frequencyData: new Uint8Array(1024) };
      }
      
      // 二分探索で現在の時間に最も近いフレームを検索
      const index = binarySearchClosestTime(state.analysisData.timestamps, state.currentTime);
      
      return {
        pitch: state.analysisData.pitchData[index] || 0,
        frequencyData: state.analysisData.frequencyData[index] || new Uint8Array(1024)
      };
    }
  }
});
```

#### 3.2 コンポーネントの責務分離

音声再生と分析データ表示の責務を明確に分離します：

```
components/
  ├── audio/
  │   ├── AudioPlayer.vue        # 音声再生のみを担当
  │   └── AudioFileUploader.vue  # ファイルアップロードのみを担当
  ├── visualization/
  │   ├── PitchVisualizer.vue    # ピッチ表示のみを担当
  │   ├── SpectrumVisualizer.vue # スペクトル表示のみを担当
  │   └── HeatMapVisualizer.vue  # ヒートマップ表示のみを担当
  └── VoiceAnalysisContainer.vue # 全体のコンテナ
```

### 4. 表示の最適化

#### 4.1 Canvas APIの最適化

Canvas描画を最適化して、より効率的な描画を実現します：

```javascript
// HeatMapCanvas.vue
const drawHeatMap = () => {
  if (!canvasRef.value || !ctx.value) return;
  
  // キャンバスサイズを設定
  const canvas = canvasRef.value;
  const width = canvas.width;
  const height = canvas.height;
  
  // 描画前にクリア
  ctx.value.clearRect(0, 0, width, height);
  
  // ImageDataを直接操作して高速化
  const imageData = ctx.value.createImageData(width, height);
  const data = imageData.data;
  
  // 周波数データを描画
  if (props.frequencyData && props.frequencyData.length > 0) {
    const binCount = props.frequencyData.length;
    const binWidth = width / binCount;
    
    for (let i = 0; i < binCount; i++) {
      const value = props.frequencyData[i];
      const intensity = value / 255;
      
      // 色を計算（ヒートマップ）
      const color = getHeatMapColor(intensity);
      
      // 縦線を描画
      const x = Math.floor(i * binWidth);
      const barWidth = Math.ceil(binWidth);
      
      for (let j = 0; j < barWidth; j++) {
        const pixelX = x + j;
        if (pixelX < width) {
          for (let y = 0; y < height; y++) {
            const index = (y * width + pixelX) * 4;
            data[index] = color.r;     // R
            data[index + 1] = color.g; // G
            data[index + 2] = color.b; // B
            data[index + 3] = 255;     // A
          }
        }
      }
    }
  }
  
  // ImageDataを一度に描画
  ctx.value.putImageData(imageData, 0, 0);
};
```

#### 4.2 表示の間引き処理

表示解像度に応じてデータを間引くことで、描画負荷を軽減します：

```javascript
// SpectrumCanvas.vue
const drawSpectrum = () => {
  if (!canvasRef.value || !ctx.value) return;
  
  const canvas = canvasRef.value;
  const width = canvas.width;
  const height = canvas.height;
  
  // 描画前にクリア
  ctx.value.clearRect(0, 0, width, height);
  
  // 周波数データを描画
  if (props.frequencyData && props.frequencyData.length > 0) {
    const binCount = props.frequencyData.length;
    
    // 表示解像度に応じて間引く
    const samplingRate = Math.max(1, Math.floor(binCount / width));
    
    ctx.value.beginPath();
    ctx.value.moveTo(0, height);
    
    for (let i = 0; i < binCount; i += samplingRate) {
      const value = props.frequencyData[i];
      const x = (i / binCount) * width;
      const y = height - (value / 255) * height;
      
      ctx.value.lineTo(x, y);
    }
    
    ctx.value.lineTo(width, height);
    ctx.value.closePath();
    
    // グラデーションを設定
    const gradient = ctx.value.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(247, 37, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 0, 180, 0.2)');
    
    ctx.value.fillStyle = gradient;
    ctx.value.fill();
  }
};
```

## 実装ステップ

1. **準備段階**
   - 既存コードのバックアップ
   - 必要なライブラリのインストール（状態管理ライブラリなど）

2. **基本実装**
   - カスタム再生コントロールの実装
   - 二分探索アルゴリズムの実装

3. **拡張実装**
   - キャッシュ機構の導入
   - 表示の最適化

4. **リファクタリング**
   - コンポーネントの責務分離
   - 状態管理の一元化

## パフォーマンス比較

| 機能 | 現在の実装 | 改善後の実装 | 改善率 |
|------|------------|--------------|--------|
| 再生位置更新頻度 | 約3-4fps | 約60fps | 約15-20倍 |
| フレーム検索時間 | O(n) | O(log n) | 数百倍以上* |
| 描画更新時間 | 不定 | 最適化 | 約2-3倍 |

*240fpsの1分音声（14,400フレーム）の場合、線形探索は最悪14,400回の比較が必要ですが、二分探索は約14回（log₂14400≈13.8）の比較で済みます。

## 結論

提案した改善案を実装することで、240fpsの高解像度分析データを活かしつつ、滑らかな表示と直感的な操作性を実現できます。特に、カスタム再生コントロールと二分探索アルゴリズムの導入は、ユーザー体験を大幅に向上させる効果が期待できます。

また、長期的な保守性と拡張性を考慮して、コンポーネントの責務分離と状態管理の一元化も推奨します。これにより、将来的な機能追加や改善がより容易になります。