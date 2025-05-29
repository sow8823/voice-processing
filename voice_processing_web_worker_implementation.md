# Webワーカーを活用した音声分析・可視化システムの最適化

## 背景と目的

現在の音声分析・可視化システムでは、分析データが240fpsという高頻度で保存されており、これを滑らかに表示するためには処理負荷が高くなります。特に以下の処理がメインスレッドの負荷となっています：

1. 大量の分析データからの検索処理
2. 複雑な描画処理
3. 音声データの分析処理

これらの処理をメインスレッドで行うと、UIのレスポンシブ性が低下し、特に低スペックデバイスでは体験が悪化する可能性があります。

Webワーカーを活用することで、これらの処理負荷をバックグラウンドスレッドに移し、メインスレッド（UIスレッド）の負荷を軽減できます。これにより、UIのレスポンシブ性を維持しながら、高精度な分析と滑らかな表示を両立できます。

## Webワーカーの活用方針

### 1. データ検索処理のオフロード

現在、再生位置に対応するフレームデータの検索は、メインスレッドで行われています。この処理をWebワーカーにオフロードします。

#### 実装例：

```javascript
// worker.js - 検索処理を担当するワーカー
self.onmessage = function(e) {
  const { action, data } = e.data;
  
  switch (action) {
    case 'init':
      // 初期化時に全分析データを受け取る
      self.analysisData = data.analysisData;
      self.postMessage({ action: 'initialized' });
      break;
      
    case 'findFrame':
      // 指定された時間に最も近いフレームを検索
      const targetTime = data.currentTime;
      const frameIndex = binarySearchClosestTime(self.analysisData.timestamps, targetTime);
      
      // 結果を返す
      self.postMessage({
        action: 'frameFound',
        frameIndex: frameIndex,
        frameData: {
          pitch: self.analysisData.pitchData[frameIndex],
          frequencyData: self.analysisData.frequencyData[frameIndex]
        },
        requestId: data.requestId // リクエストIDを返して非同期処理を追跡
      });
      break;
  }
};

// 二分探索で最も近い時間のインデックスを検索する関数
function binarySearchClosestTime(timestamps, targetTime) {
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
}
```

```javascript
// VoiceVisual.vue - メインスレッド側
import { ref, onMounted, onUnmounted } from 'vue';

// ワーカーの参照
const searchWorker = ref(null);
// リクエスト管理用のIDとコールバックのマップ
const pendingRequests = ref(new Map());
// リクエストIDカウンター
let requestIdCounter = 0;

// コンポーネントのマウント時にワーカーを初期化
onMounted(() => {
  // ワーカーを作成
  searchWorker.value = new Worker(new URL('./search-worker.js', import.meta.url));
  
  // ワーカーからのメッセージを処理
  searchWorker.value.onmessage = (e) => {
    const { action, requestId, frameIndex, frameData } = e.data;
    
    if (action === 'initialized') {
      console.log('検索ワーカーが初期化されました');
    } else if (action === 'frameFound') {
      // 対応するリクエストのコールバックを呼び出す
      const callback = pendingRequests.value.get(requestId);
      if (callback) {
        callback(frameIndex, frameData);
        pendingRequests.value.delete(requestId);
      }
    }
  };
  
  // 分析データが準備できたらワーカーに送信
  watch(() => analysisCompleted.value, (completed) => {
    if (completed && analysisData.value.timestamps.length > 0) {
      searchWorker.value.postMessage({
        action: 'init',
        data: {
          analysisData: analysisData.value
        }
      });
    }
  });
});

// コンポーネントのアンマウント時にワーカーを終了
onUnmounted(() => {
  if (searchWorker.value) {
    searchWorker.value.terminate();
    searchWorker.value = null;
  }
});

// 現在の再生時間に合わせて表示を更新する関数
const updateDisplayWithCurrentTime = (currentTime) => {
  if (!analysisCompleted.value || !searchWorker.value) {
    return;
  }
  
  // リクエストIDを生成
  const requestId = requestIdCounter++;
  
  // ワーカーにフレーム検索をリクエスト
  searchWorker.value.postMessage({
    action: 'findFrame',
    data: {
      currentTime,
      requestId
    }
  });
  
  // コールバックを登録
  pendingRequests.value.set(requestId, (frameIndex, frameData) => {
    // 見つかったフレームのデータを表示
    currentPitch.value = frameData.pitch;
    frequencyData.value = frameData.frequencyData;
  });
};
```

### 2. 描画処理の最適化

複雑な描画処理（特にヒートマップなど）をWebワーカーで前処理し、メインスレッドでは単純な描画のみを行うようにします。

#### 実装例：

```javascript
// render-worker.js - 描画前処理を担当するワーカー
self.onmessage = function(e) {
  const { action, data } = e.data;
  
  switch (action) {
    case 'prepareHeatMap':
      // 周波数データからヒートマップ用のピクセルデータを生成
      const { frequencyData, width, height } = data;
      const pixelData = generateHeatMapPixels(frequencyData, width, height);
      
      // 結果を返す
      self.postMessage({
        action: 'heatMapPrepared',
        pixelData: pixelData,
        requestId: data.requestId
      }, [pixelData.buffer]); // Transferable Objectsを使用して高速化
      break;
  }
};

// ヒートマップ用のピクセルデータを生成する関数
function generateHeatMapPixels(frequencyData, width, height) {
  // RGBA値を格納するUint8ClampedArray
  const pixels = new Uint8ClampedArray(width * height * 4);
  
  const binCount = frequencyData.length;
  const binWidth = width / binCount;
  
  for (let i = 0; i < binCount; i++) {
    const value = frequencyData[i];
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
          pixels[index] = color.r;     // R
          pixels[index + 1] = color.g; // G
          pixels[index + 2] = color.b; // B
          pixels[index + 3] = 255;     // A
        }
      }
    }
  }
  
  return pixels;
}

// 強度から色を計算する関数
function getHeatMapColor(intensity) {
  // 青から赤へのグラデーション
  if (intensity < 0.2) {
    return { r: 0, g: 0, b: Math.floor(intensity * 5 * 180) + 75 };
  } else if (intensity < 0.4) {
    return { r: 0, g: Math.floor((intensity - 0.2) * 5 * 255), b: Math.floor((0.4 - intensity) * 5 * 180) + 75 };
  } else if (intensity < 0.6) {
    return { r: Math.floor((intensity - 0.4) * 5 * 255), g: 255, b: 0 };
  } else if (intensity < 0.8) {
    return { r: 255, g: Math.floor((0.8 - intensity) * 5 * 255), b: 0 };
  } else {
    return { r: 255, g: Math.floor((intensity - 0.8) * 5 * 255), b: Math.floor((intensity - 0.8) * 5 * 255) };
  }
}
```

```javascript
// HeatMapCanvas.vue - メインスレッド側
import { ref, onMounted, onUnmounted, watch } from 'vue';

// ワーカーの参照
const renderWorker = ref(null);
// リクエスト管理用のIDとコールバックのマップ
const pendingRenderRequests = ref(new Map());
// リクエストIDカウンター
let renderRequestIdCounter = 0;

// コンポーネントのマウント時にワーカーを初期化
onMounted(() => {
  // ワーカーを作成
  renderWorker.value = new Worker(new URL('./render-worker.js', import.meta.url));
  
  // ワーカーからのメッセージを処理
  renderWorker.value.onmessage = (e) => {
    const { action, requestId, pixelData } = e.data;
    
    if (action === 'heatMapPrepared') {
      // 対応するリクエストのコールバックを呼び出す
      const callback = pendingRenderRequests.value.get(requestId);
      if (callback) {
        callback(pixelData);
        pendingRenderRequests.value.delete(requestId);
      }
    }
  };
});

// コンポーネントのアンマウント時にワーカーを終了
onUnmounted(() => {
  if (renderWorker.value) {
    renderWorker.value.terminate();
    renderWorker.value = null;
  }
});

// 周波数データが変更されたときに描画を更新
watch(() => props.frequencyData, (newFrequencyData) => {
  if (newFrequencyData && newFrequencyData.length > 0 && canvasRef.value && renderWorker.value) {
    const canvas = canvasRef.value;
    const width = canvas.width;
    const height = canvas.height;
    
    // リクエストIDを生成
    const requestId = renderRequestIdCounter++;
    
    // ワーカーにヒートマップ生成をリクエスト
    renderWorker.value.postMessage({
      action: 'prepareHeatMap',
      data: {
        frequencyData: newFrequencyData,
        width,
        height,
        requestId
      }
    });
    
    // コールバックを登録
    pendingRenderRequests.value.set(requestId, (pixelData) => {
      // ピクセルデータを使用して描画
      const ctx = canvas.getContext('2d');
      const imageData = new ImageData(pixelData, width, height);
      ctx.putImageData(imageData, 0, 0);
    });
  }
}, { deep: true });
```

### 3. 音声分析処理のオフロード

音声ファイルの分析処理（特に240fpsの高頻度分析）をWebワーカーで行うことで、分析中もUIのレスポンシブ性を維持します。

#### 実装例：

```javascript
// analysis-worker.js - 音声分析を担当するワーカー
// WASMモジュールをインポート（ピッチ検出ライブラリ）
importScripts('./pitch_detection.js');

let pitchDetectionModule = null;

// WASMモジュールの初期化
async function initializePitchDetection() {
  if (!pitchDetectionModule) {
    pitchDetectionModule = await PitchDetection();
  }
  return pitchDetectionModule;
}

self.onmessage = async function(e) {
  const { action, data } = e.data;
  
  switch (action) {
    case 'analyzeAudio':
      try {
        // ピッチ検出モジュールを初期化
        const module = await initializePitchDetection();
        
        const { audioData, sampleRate, frameInterval, options } = data;
        
        // 分析結果を格納する配列
        const pitchData = [];
        const frequencyData = [];
        const timestamps = [];
        
        // 音声の長さを計算
        const duration = audioData.length / sampleRate;
        
        // フレーム数を計算
        const totalFrames = Math.ceil(duration / frameInterval);
        
        // 進捗報告の間隔
        const progressStep = Math.max(1, Math.floor(totalFrames / 100));
        
        // バッファサイズ
        const bufferSize = 2048;
        
        // FFTサイズ
        const fftSize = bufferSize * 2;
        const frequencyBinCount = fftSize / 2;
        
        // 各フレームを分析
        for (let frame = 0; frame < totalFrames; frame++) {
          const currentTime = frame * frameInterval;
          
          // 現在の時間位置のオーディオデータを取得
          const startSample = Math.floor(currentTime * sampleRate);
          
          // 一時バッファを作成
          const tempBuffer = new Float32Array(bufferSize);
          
          // オーディオデータをコピー
          for (let i = 0; i < bufferSize; i++) {
            const sampleIndex = startSample + i;
            if (sampleIndex < audioData.length) {
              tempBuffer[i] = audioData[sampleIndex];
            }
          }
          
          // ピッチを検出
          const pitch = module.detectPitch(tempBuffer, sampleRate, options);
          
          // 周波数データを計算（簡易版 - 実際にはFFTが必要）
          const currentFrequencyData = new Uint8Array(frequencyBinCount);
          module.getFrequencyData(tempBuffer, currentFrequencyData);
          
          // 分析データを保存
          timestamps.push(currentTime);
          pitchData.push(pitch);
          frequencyData.push(currentFrequencyData);
          
          // 進捗を報告
          if (frame % progressStep === 0) {
            self.postMessage({
              action: 'analysisProgress',
              progress: frame / totalFrames,
              requestId: data.requestId
            });
          }
        }
        
        // 分析結果を返す
        self.postMessage({
          action: 'analysisComplete',
          result: {
            pitchData,
            frequencyData,
            timestamps
          },
          requestId: data.requestId
        });
      } catch (error) {
        self.postMessage({
          action: 'analysisError',
          error: error.message,
          requestId: data.requestId
        });
      }
      break;
  }
};
```

```javascript
// VoiceVisual.vue - メインスレッド側
import { ref, onMounted, onUnmounted } from 'vue';

// ワーカーの参照
const analysisWorker = ref(null);
// 分析リクエスト管理
const pendingAnalysisRequests = ref(new Map());
// リクエストIDカウンター
let analysisRequestIdCounter = 0;

// コンポーネントのマウント時にワーカーを初期化
onMounted(() => {
  // ワーカーを作成
  analysisWorker.value = new Worker(new URL('./analysis-worker.js', import.meta.url));
  
  // ワーカーからのメッセージを処理
  analysisWorker.value.onmessage = (e) => {
    const { action, requestId, progress, result, error } = e.data;
    
    if (action === 'analysisProgress') {
      // 進捗を更新
      analysisProgress.value = progress * 100;
    } else if (action === 'analysisComplete') {
      // 分析結果を保存
      analysisData.value = result;
      analysisCompleted.value = true;
      analysisProgress.value = 100;
      
      // コールバックを呼び出す
      const callback = pendingAnalysisRequests.value.get(requestId);
      if (callback) {
        callback(null, result);
        pendingAnalysisRequests.value.delete(requestId);
      }
    } else if (action === 'analysisError') {
      console.error('分析エラー:', error);
      
      // コールバックを呼び出す
      const callback = pendingAnalysisRequests.value.get(requestId);
      if (callback) {
        callback(new Error(error), null);
        pendingAnalysisRequests.value.delete(requestId);
      }
    }
  };
});

// コンポーネントのアンマウント時にワーカーを終了
onUnmounted(() => {
  if (analysisWorker.value) {
    analysisWorker.value.terminate();
    analysisWorker.value = null;
  }
});

// ファイルの分析リクエストがあったときの処理
const analyzeAudioFile = async (audioBuffer) => {
  if (!audioBuffer || !analysisWorker.value) {
    console.error('音声バッファが空かワーカーが初期化されていません');
    return;
  }
  
  console.log('音声ファイルの分析を開始します', {
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels
  });
  
  // 分析完了フラグをリセット
  analysisCompleted.value = false;
  analysisProgress.value = 0;
  
  try {
    // 分析データをリセット
    analysisData.value = {
      pitchData: [],
      frequencyData: [],
      timestamps: []
    };
    
    // オーディオデータを取得
    const audioData = audioBuffer.getChannelData(0);
    
    // リクエストIDを生成
    const requestId = analysisRequestIdCounter++;
    
    // 分析オプション
    const options = {
      powerThreshold: 0.001,
      clarityThreshold: 0.7
    };
    
    // ワーカーに分析をリクエスト
    analysisWorker.value.postMessage({
      action: 'analyzeAudio',
      data: {
        audioData,
        sampleRate: audioBuffer.sampleRate,
        frameInterval: 1 / 240, // 240fps
        options,
        requestId
      }
    });
    
    // Promiseを返す
    return new Promise((resolve, reject) => {
      pendingAnalysisRequests.value.set(requestId, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  } catch (error) {
    console.error('音声ファイルの分析に失敗しました:', error);
    alert('音声ファイルの分析に失敗しました。');
    analysisCompleted.value = false;
    throw error;
  }
};
```

## Webワーカー活用のメリット

### 1. UIのレスポンシブ性向上

メインスレッドの負荷が軽減されるため、UIの応答性が向上します。特に以下の場面で効果を発揮します：

- 長時間の音声ファイル分析中
- 複雑なヒートマップ描画時
- 高頻度の再生位置更新時

### 2. 分析精度の維持

Webワーカーを使用することで、分析精度を落とすことなく、パフォーマンスを向上できます。240fpsという高解像度の分析データを維持したまま、滑らかな表示を実現できます。

### 3. マルチコアCPUの活用

Webワーカーを使用することで、マルチコアCPUの性能を活かせます。メインスレッドとワーカースレッドが並列に動作することで、全体的なパフォーマンスが向上します。

### 4. スケーラビリティの向上

必要に応じて複数のワーカーを作成し、異なる処理を並列化できます。例えば：

- 検索用ワーカー
- 描画前処理用ワーカー
- 分析用ワーカー

これにより、将来的な機能拡張にも柔軟に対応できます。

## 実装上の注意点

### 1. データ転送のオーバーヘッド

メインスレッドとワーカー間のデータ転送にはコストがかかります。特に大きなデータ（例：周波数データの配列）を頻繁に転送する場合は注意が必要です。

**対策**:
- Transferable Objectsを使用して転送コストを削減
- 必要最小限のデータのみを転送
- 適切なタイミングでまとめて転送

### 2. 初期化コスト

ワーカーの作成と初期化にはコストがかかります。特にWASMモジュールを使用する場合は、初期化に時間がかかる可能性があります。

**対策**:
- コンポーネントのマウント時に事前初期化
- 必要なワーカーのみを作成
- 再利用可能なワーカープールの検討

### 3. デバッグの複雑さ

ワーカーのデバッグは、メインスレッドのデバッグよりも複雑になる場合があります。

**対策**:
- 詳細なログ出力
- エラーハンドリングの強化
- 開発モードでのデバッグ支援機能の実装

## 実装ステップ

1. **基本的なワーカー構造の実装**
   - 各ワーカーファイルの作成
   - メッセージングインターフェースの設計

2. **検索処理のオフロード**
   - 二分探索アルゴリズムのワーカー実装
   - メインスレッドとの連携

3. **描画前処理のオフロード**
   - ヒートマップ生成処理のワーカー実装
   - Canvas描画の最適化

4. **分析処理のオフロード**
   - WASM連携の実装
   - 進捗報告機能の実装

5. **エラーハンドリングとリカバリ**
   - 各種エラーケースの対応
   - フォールバック機構の実装

## 結論

Webワーカーを活用することで、分析精度を維持したまま、UIのレスポンシブ性を大幅に向上させることができます。特に、240fpsという高解像度の分析データを扱う本システムでは、Webワーカーの活用が非常に効果的です。

検索処理、描画前処理、分析処理をそれぞれ専用のワーカーにオフロードすることで、メインスレッドの負荷を軽減し、滑らかな表示と直感的な操作性を実現できます。また、マルチコアCPUの性能を活かすことで、全体的なパフォーマンスも向上します。

実装にあたっては、データ転送のオーバーヘッドや初期化コストに注意しながら、適切なタイミングでワーカーを活用することが重要です。