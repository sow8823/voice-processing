# 音声分析アプリ修正レポート

## 1. 修正の目的

現在の音声分析アプリに以下の修正を加えることが目的でした：

1. 分析ボタンを削除し、再生ボタンで分析と再生を同時に実行するようにする
2. 周波数スペクトルとヒートマップの動作を修正する
3. リアルタイム検出と同様の処理を音声ファイル再生時にも適用する

## 2. 前回までの仕様

### 2.1 音声ファイル処理の流れ

1. AudioFileUploaderコンポーネントでファイルをアップロード
2. 再生ボタンでファイルを再生
3. 分析ボタンで別途分析を実行
4. 分析時は簡易的な実装（Math.sinを使用）で周波数データを生成

### 2.2 主要コンポーネントの役割

#### AudioFileUploader.vue
- 音声ファイルのアップロード機能
- 音声ファイルの再生機能
- 分析ボタンによる分析リクエスト発火

#### VoiceVisual.vue
- マイク入力とファイル入力の切り替え
- ピッチ検出、周波数スペクトル、ヒートマップの表示
- 音声ファイルの分析処理（analyzeAudioFile関数）

#### AudioService.ts
- マイク入力の処理
- 時間領域と周波数領域のデータ取得

## 3. 修正内容と方針

### 3.1 修正方針

リアルタイム検出（マイク入力）では周波数スペクトルとヒートマップが正常に動作していたため、音声ファイル再生時もリアルタイム検出と同様の処理を行うように変更しました。具体的には、一時的なAudioContextを毎フレーム作成する代わりに、AudioServiceを拡張して音声ファイルを処理できるようにしました。

### 3.2 主な修正内容

#### AudioService.ts の修正
```typescript
// 新しいプロパティを追加
private fileBuffer: AudioBuffer | null = null;
private fileSource: AudioBufferSourceNode | null = null;

// 音声ファイルを設定するメソッドを追加
setAudioFileBuffer(audioBuffer: AudioBuffer): void {
  // 既存のファイルソースがあれば切断
  if (this.fileSource) {
    this.fileSource.disconnect();
    this.fileSource = null;
  }

  // 新しいファイルバッファを設定
  this.fileBuffer = audioBuffer;

  // AudioContextが初期化されていない場合は初期化
  if (!this.audioContext) {
    this.audioContext = new (window.AudioContext || window.AudioContext)();
  }

  // アナライザーが初期化されていない場合は初期化
  if (!this.analyser) {
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.minDecibels = -90;
    this.analyser.smoothingTimeConstant = 0.85;
  }

  // ファイルソースを作成
  this.fileSource = this.audioContext.createBufferSource();
  this.fileSource.buffer = audioBuffer;

  // ソースをアナライザーに接続
  this.fileSource.connect(this.analyser);

  // 音声出力にも接続
  this.analyser.connect(this.audioContext.destination);

  // ソースを保存
  this.source = this.fileSource;
  this.isInitialized = true;
}

// 音声ファイルの再生を開始するメソッドを追加
startAudioFile(): void {
  if (this.fileSource && this.audioContext) {
    // 既に再生中の場合は停止
    if (this.fileSource.buffer) {
      this.fileSource.stop();
    }

    // 新しいソースを作成
    this.fileSource = this.audioContext.createBufferSource();
    if (this.fileBuffer) {
      this.fileSource.buffer = this.fileBuffer;
    }

    // アナライザーと出力に接続
    if (this.analyser) {
      this.fileSource.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    }

    // 再生開始
    this.fileSource.start();
    this.source = this.fileSource;
  }
}
```

#### AudioFileUploader.vue の修正
```typescript
// 分析ボタンを削除し、再生ボタンで再生と分析を同時に行うように変更
const playAudio = () => {
  if (!audioBuffer.value || !audioPlayer.value) return;
  
  isAnalyzing.value = true;
  
  try {
    // 再生を開始
    audioPlayer.value.play();
    
    // 分析リクエストを発火
    emit('analysis-requested', audioBuffer.value);
  } catch (error) {
    console.error('音声再生・分析に失敗しました:', error);
    alert('音声再生・分析に失敗しました。');
    isAnalyzing.value = false;
  }
};

// 再生終了時のイベント発火を追加
const handleAudioEnded = () => {
  isAnalyzing.value = false;
  emit('playback-ended');
};
```

#### VoiceVisual.vue の修正
```typescript
// analyzeAudioFile関数を修正
const analyzeAudioFile = async (audioBuffer: AudioBuffer) => {
  if (!audioBuffer) return;
  
  try {
    // ピッチ検出サービスを初期化
    await pitchDetectionService.initialize();
    
    // バッファサイズを設定
    const bufferSize = 2048;
    
    // AudioServiceにファイルバッファを設定
    audioService.setAudioFileBuffer(audioBuffer);
    
    // FFTサイズを設定
    audioService.setFFTSize(bufferSize);
    
    // 周波数データ用の配列を初期化
    frequencyData.value = new Uint8Array(audioService.getFrequencyBinCount());
    
    // サンプリングレートを取得
    const sampleRate = audioService.getSampleRate();
    
    // 閾値の設定
    const powerThreshold = 0.001;
    const clarityThreshold = 0.7;
    
    // 分析用の一時バッファ
    const tempBuffer = new Float32Array(bufferSize);
    
    // 既存のアニメーションフレームをクリア
    if (animationFrameId.value !== null) {
      cancelAnimationFrame(animationFrameId.value);
    }
    
    // 音声ファイルの再生を開始
    audioService.startAudioFile();
    
    // 分析関数
    const analyzeFrame = () => {
      // 時間領域のデータを取得
      audioService.getTimeDomainData(tempBuffer);
      
      // 周波数領域のデータを取得
      audioService.getFrequencyData(frequencyData.value);
      
      // Vueのリアクティビティを維持するために新しい参照を作成
      frequencyData.value = new Uint8Array([...frequencyData.value]);
      
      // ピッチを検出
      currentPitch.value = pitchDetectionService.detectPitch(
        tempBuffer,
        sampleRate,
        { powerThreshold, clarityThreshold }
      );
      
      // 次のフレームをスケジュール
      animationFrameId.value = requestAnimationFrame(analyzeFrame);
    };
    
    // 分析を開始
    analyzeFrame();
  } catch (error) {
    console.error('音声ファイルの分析に失敗しました:', error);
    alert('音声ファイルの分析に失敗しました。');
  }
};

// 再生終了時の処理を追加
const handlePlaybackEnded = () => {
  // アニメーションフレームをキャンセル
  if (animationFrameId.value !== null) {
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
  
  // ピッチと周波数データをリセット
  currentPitch.value = 0;
  frequencyData.value = new Uint8Array(frequencyData.value.length);
};
```

## 4. 問題点と考察

修正後、再生機能のみが動作し、分析機能が動作しなくなった原因として以下が考えられます：

### 4.1 可能性のある問題点

1. **二重再生の問題**：
   - HTMLのaudio要素とAudioServiceの両方で音声を再生しているため、タイミングのずれや競合が発生している可能性があります。
   - AudioFileUploaderコンポーネントでaudio要素を使って再生し、同時にAudioServiceでも再生しているため、どちらかが正しく機能していない可能性があります。

2. **AudioContextの接続問題**：
   - AudioServiceでのアナライザーノードの接続が正しく行われていない可能性があります。
   - 特に、`fileSource.connect(analyser)`と`analyser.connect(audioContext.destination)`の部分で問題が発生している可能性があります。

3. **イベント連携の問題**：
   - AudioFileUploaderからVoiceVisualへのイベント連携が正しく機能していない可能性があります。
   - 特に、再生終了時のイベント処理が正しく行われていない可能性があります。

### 4.2 改善案

1. **再生方法の統一**：
   - HTMLのaudio要素での再生を廃止し、AudioServiceのみで再生と分析を行うようにする。
   - または、HTMLのaudio要素での再生のみを行い、そのaudio要素からMediaElementAudioSourceNodeを作成して分析に使用する。

2. **デバッグ情報の追加**：
   - 各処理ステップでコンソールログを追加し、どの部分で問題が発生しているかを特定する。
   - 特に、AudioServiceのメソッド内での状態変化や、イベント発火のタイミングを確認する。

3. **シンプルな実装への回帰**：
   - 一度シンプルな実装に戻し、段階的に機能を追加していくことで、どの部分で問題が発生するかを特定する。
   - 例えば、まずはHTMLのaudio要素での再生と、簡易的な分析処理を行い、それが正常に動作することを確認してから、より高度な分析処理を追加する。

## 5. 結論

今回の修正では、リアルタイム検出と同様の処理を音声ファイル再生時にも適用するという方針で実装を行いましたが、結果として再生機能のみが動作し、分析機能が動作しなくなってしまいました。

原因として考えられるのは、AudioServiceの拡張部分での問題や、二重再生による競合、イベント連携の問題などが挙げられます。

今後は、より段階的なアプローチで問題を特定し、修正していくことが望ましいと考えられます。特に、HTMLのaudio要素とWeb Audio APIの連携部分を見直し、一貫した処理フローを構築することが重要です。