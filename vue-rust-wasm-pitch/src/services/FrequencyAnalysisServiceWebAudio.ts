/**
 * Web Audio APIのAnalyserNodeを使用した周波数分析サービス
 */
export interface HarmonicAnalysisResult {
  harmonic2Ratio: number;  // 2倍音の強度比率（%）
  harmonic3Ratio: number;  // 3倍音の強度比率（%）
  bandPeakRatio: number;   // 特定の周波数帯域（2.8kHz～3.2kHz）の最大成分比率（%）
}

export class FrequencyAnalysisServiceWebAudio {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isWorkletRegistered = false;

  /**
   * サービスを初期化する
   * @param fftSize FFTサイズ（デフォルト: 2048）
   */
  async initialize(fftSize: number = 2048): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.AudioContext)();
    }

    // AudioWorkletを登録
    if (!this.isWorkletRegistered) {
      try {
        // 開発環境と本番環境で異なるパスを使用
        let workletPath;
        if (import.meta.env.DEV) {
          // 開発環境では相対パスを使用
          workletPath = new URL('../worklets/frequency-analyzer-processor.js', import.meta.url).href;
        } else {
          // 本番環境ではビルド後のパスを使用
          workletPath = '/assets/worklets/frequency-analyzer-processor.js';
        }
        
        console.log('AudioWorkletを登録します:', workletPath);
        await this.audioContext.audioWorklet.addModule(workletPath);
        this.isWorkletRegistered = true;
        console.log('AudioWorkletが正常に登録されました');
      } catch (error) {
        console.error('AudioWorkletの登録に失敗しました:', error);
        // AudioWorkletが使用できない場合でも続行できるようにする
        console.warn('AudioWorkletが使用できないため、代替手段を使用します');
        this.isWorkletRegistered = true; // エラーを無視して続行
      }
    }

    // AnalyserNodeを作成
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0.0; // スムージングなし
  }

  /**
   * AudioWorkletNodeを作成する
   * @param bufferSize バッファサイズ
   * @param hopSize ホップサイズ
   * @returns AudioWorkletNode
   */
  createWorkletNode(bufferSize: number = 2048, hopSize: number = 1024): AudioWorkletNode {
    if (!this.audioContext || !this.isWorkletRegistered) {
      throw new Error('AudioContextまたはAudioWorkletが初期化されていません');
    }

    // AudioWorkletNodeを作成
    this.workletNode = new AudioWorkletNode(this.audioContext, 'frequency-analyzer-processor');

    // 設定をWorkletに送信
    this.workletNode.port.postMessage({
      type: 'setConfig',
      bufferSize,
      hopSize
    });

    return this.workletNode;
  }

  /**
   * 音声バッファから周波数データを取得する（非リアルタイム分析用）
   * @param audioBuffer 分析する音声バッファ
   * @param startSample 開始サンプル位置
   * @param bufferSize バッファサイズ
   * @returns 周波数データ（Uint8Array）
   */
  async getFrequencyDataFromBuffer(
    audioBuffer: AudioBuffer,
    startSample: number,
    bufferSize: number = 2048
  ): Promise<Uint8Array> {
    if (!this.audioContext) {
      throw new Error('AudioContextが初期化されていません');
    }

    // 分析対象のフレームを抽出
    const frameBuffer = new Float32Array(bufferSize);
    
    // バッファの範囲チェック
    if (startSample + bufferSize > audioBuffer.length) {
      // 範囲外の場合は、利用可能なサンプル数だけコピー
      const availableSamples = Math.max(0, audioBuffer.length - startSample);
      audioBuffer.copyFromChannel(frameBuffer.subarray(0, availableSamples), 0, startSample);
      // 残りを0で埋める
      for (let i = availableSamples; i < bufferSize; i++) {
        frameBuffer[i] = 0;
      }
    } else {
      // 通常のコピー
      audioBuffer.copyFromChannel(frameBuffer, 0, startSample);
    }

    // 一時的なオフラインコンテキストを作成（処理するバッファサイズ分の長さ）
    const offlineContext = new OfflineAudioContext(
      1,
      bufferSize,
      audioBuffer.sampleRate
    );

    // 一時的なAnalyserNodeを作成
    const analyser = offlineContext.createAnalyser();
    analyser.fftSize = bufferSize * 2; // より詳細な周波数分析のため
    analyser.smoothingTimeConstant = 0.0;

    // 一時的なバッファを作成
    const tempBuffer = offlineContext.createBuffer(1, bufferSize, audioBuffer.sampleRate);
    tempBuffer.copyToChannel(frameBuffer, 0);

    // バッファソースを作成
    const source = offlineContext.createBufferSource();
    source.buffer = tempBuffer;
    
    // ソースをアナライザーに接続
    source.connect(analyser);
    analyser.connect(offlineContext.destination);
    
    // 再生開始（0秒から）
    source.start(0);
    
    // オフラインレンダリングを実行
    await offlineContext.startRendering();
    
    // 周波数データを取得
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyData);

    return frequencyData;
  }

  /**
   * 音声バッファから周波数データを取得する（バッチ処理用）
   * @param audioBuffer 分析する音声バッファ
   * @param bufferSize バッファサイズ
   * @param hopSize ホップサイズ
   * @returns 周波数データの配列（Uint8Array[]）とタイムスタンプの配列（number[]）
   */
  async analyzeAudioBufferBatch(
    audioBuffer: AudioBuffer,
    bufferSize: number = 2048,
    hopSize: number = 1024
  ): Promise<{ frequencyDataArray: Uint8Array[], timestamps: number[] }> {
    if (!this.audioContext) {
      throw new Error('AudioContextが初期化されていません');
    }

    // 分析結果を格納する配列
    const frequencyDataArray: Uint8Array[] = [];
    const timestamps: number[] = [];

    // フレーム数を計算
    const numFrames = Math.floor((audioBuffer.length - bufferSize) / hopSize) + 1;
    
    // 各フレームを分析
    for (let i = 0; i < numFrames; i++) {
      // フレームの開始位置
      const startSample = i * hopSize;
      
      // フレームの時間（秒）
      const timestamp = startSample / audioBuffer.sampleRate;
      
      try {
        // 周波数データを取得
        const frequencyData = await this.getFrequencyDataFromBuffer(
          audioBuffer,
          startSample,
          bufferSize
        );
        
        // 結果を保存
        frequencyDataArray.push(new Uint8Array(frequencyData));
        timestamps.push(timestamp);
      } catch (error) {
        console.error(`フレーム ${i} の分析に失敗しました:`, error);
      }
    }
    
    return { frequencyDataArray, timestamps };
  }

  /**
   * 周波数インデックスを計算する
   * @param frequency 周波数（Hz）
   * @param sampleRate サンプリングレート
   * @param fftSize FFTサイズ
   * @returns 周波数に対応するインデックス
   */
  getFrequencyIndex(frequency: number, sampleRate: number, fftSize: number): number {
    return Math.round((frequency / sampleRate) * fftSize);
  }

  /**
   * 倍音分析を行う
   * @param frequencyData 周波数データ
   * @param baseFrequency 基本周波数
   * @param sampleRate サンプリングレート
   * @returns 倍音分析結果
   */
  analyzeHarmonics(
    frequencyData: Uint8Array,
    baseFrequency: number,
    sampleRate: number
  ): HarmonicAnalysisResult {
    // 基本周波数が低すぎる場合は分析しない
    if (!baseFrequency || baseFrequency < 50) {
      return {
        harmonic2Ratio: 0,
        harmonic3Ratio: 0,
        bandPeakRatio: 0
      };
    }

    const fftSize = frequencyData.length * 2;
    
    // 基本周波数のインデックスを計算
    const baseIdx = this.getFrequencyIndex(baseFrequency, sampleRate, fftSize);
    const baseAmp = frequencyData[baseIdx] || 1; // ゼロ除算を防ぐため、最小値を1とする
    
    // 2倍音のインデックスと振幅を計算
    const harmonic2Idx = this.getFrequencyIndex(baseFrequency * 2, sampleRate, fftSize);
    const harmonic2Amp = harmonic2Idx < frequencyData.length ? frequencyData[harmonic2Idx] : 0;
    const harmonic2Ratio = (harmonic2Amp / baseAmp) * 100;
    
    // 3倍音のインデックスと振幅を計算
    const harmonic3Idx = this.getFrequencyIndex(baseFrequency * 3, sampleRate, fftSize);
    const harmonic3Amp = harmonic3Idx < frequencyData.length ? frequencyData[harmonic3Idx] : 0;
    const harmonic3Ratio = (harmonic3Amp / baseAmp) * 100;
    
    // 2.8kHz～3.2kHzの周波数帯域の最大振幅を計算
    const startIdx = this.getFrequencyIndex(2800, sampleRate, fftSize);
    const endIdx = this.getFrequencyIndex(3200, sampleRate, fftSize);
    
    let maxAmp = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      if (i < frequencyData.length && frequencyData[i] > maxAmp) {
        maxAmp = frequencyData[i];
      }
    }
    
    const bandPeakRatio = (maxAmp / baseAmp) * 100;
    
    return {
      harmonic2Ratio,
      harmonic3Ratio,
      bandPeakRatio
    };
  }

  /**
   * リソースを解放する
   */
  dispose(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isWorkletRegistered = false;
  }
}

// シングルトンインスタンスをエクスポート
export const frequencyAnalysisServiceWebAudio = new FrequencyAnalysisServiceWebAudio();