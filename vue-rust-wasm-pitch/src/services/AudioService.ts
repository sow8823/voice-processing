/**
 * 音声入力と処理を担当するサービス
 */
export class AudioService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isInitialized = false;

  /**
   * 音声処理を初期化する
   * @returns AudioContextとAnalyserNodeを含むオブジェクト
   */
  async initialize(): Promise<{ audioContext: AudioContext; analyser: AnalyserNode }> {
    if (this.isInitialized) {
      return {
        audioContext: this.audioContext!,
        analyser: this.analyser!
      };
    }

    try {
      // AudioContextの作成
      this.audioContext = new (window.AudioContext || window.AudioContext)();
      
      // マイクからの音声入力を取得
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      
      // アナライザーノードの設定
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.minDecibels = -90;
      this.analyser.smoothingTimeConstant = 0.85;
      
      // ソースをアナライザーに接続
      this.source.connect(this.analyser);
      
      this.isInitialized = true;
      
      return {
        audioContext: this.audioContext,
        analyser: this.analyser
      };
    } catch (error) {
      console.error('音声処理の初期化に失敗しました:', error);
      throw error;
    }
  }

  /**
   * FFTサイズを設定する
   * @param size FFTサイズ
   */
  setFFTSize(size: number): void {
    if (this.analyser) {
      this.analyser.fftSize = size;
    }
  }

  /**
   * 時間領域のオーディオデータを取得する
   * @param buffer データを格納するバッファ
   */
  getTimeDomainData(buffer: Float32Array): void {
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(buffer);
    }
  }

  /**
   * 周波数領域のオーディオデータを取得する
   * @param buffer データを格納するバッファ
   */
  getFrequencyData(buffer: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(buffer);
    }
  }

  /**
   * 周波数ビンの数を取得する
   * @returns 周波数ビンの数
   */
  getFrequencyBinCount(): number {
    return this.analyser ? this.analyser.frequencyBinCount : 0;
  }

  /**
   * サンプリングレートを取得する
   * @returns サンプリングレート
   */
  getSampleRate(): number {
    return this.audioContext ? this.audioContext.sampleRate : 44100;
  }

  /**
   * リソースを解放する
   */
  dispose(): void {
    if (this.source) {
      this.source.disconnect();
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    
    this.audioContext = null;
    this.analyser = null;
    this.stream = null;
    this.source = null;
    this.isInitialized = false;
  }
}

// シングルトンインスタンスをエクスポート
export const audioService = new AudioService();