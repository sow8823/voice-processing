/**
 * 音声入力と処理を担当するサービス
 */
export class AudioService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | AudioBufferSourceNode | null = null;
  private isInitialized = false;
  private fileBuffer: AudioBuffer | null = null;
  private fileSource: AudioBufferSourceNode | null = null;

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.analyser.getFloatTimeDomainData(buffer as any);
    }
  }

  /**
   * 周波数領域のオーディオデータを取得する
   * @param buffer データを格納するバッファ
   */
  getFrequencyData(buffer: Uint8Array): void {
    if (this.analyser) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.analyser.getByteFrequencyData(buffer as any);
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
   * 音声ファイルを設定する
   * @param audioBuffer 音声ファイルのAudioBuffer
   */
  setAudioFileBuffer(audioBuffer: AudioBuffer): void {
    try {
      // 既存のファイルソースがあれば切断
      if (this.fileSource) {
        try {
          if (this.fileSourceStarted) {
            this.fileSource.stop();
          }
          this.fileSource.disconnect();
        } catch (error) {
          console.warn('既存のファイルソースの停止または切断に失敗しました:', error);
        }
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

      // ファイルソースは作成するだけで、まだ開始しない
      this.fileSource = this.audioContext.createBufferSource();
      this.fileSource.buffer = audioBuffer;
      this.fileSourceStarted = false;

      // ソースをアナライザーに接続
      this.fileSource.connect(this.analyser);

      // 音声出力にも接続
      this.analyser.connect(this.audioContext.destination);

      // ソースを保存
      this.source = this.fileSource;
      this.isInitialized = true;
    } catch (error) {
      console.error('音声ファイルバッファの設定に失敗しました:', error);
      throw error;
    }
  }

  /**
   * 音声ファイルの再生を開始する
   */
  // AudioBufferSourceNodeが開始されているかどうかを追跡するフラグ
  private fileSourceStarted = false;

  startAudioFile(): void {
    if (this.audioContext) {
      try {
        // 既存のソースがあり、既に開始されている場合は停止
        if (this.fileSource && this.fileSourceStarted) {
          try {
            this.fileSource.stop();
          } catch (error) {
            console.warn('ファイルソースの停止に失敗しました:', error);
          }
        }

        // 新しいソースを作成
        this.fileSource = this.audioContext.createBufferSource();
        this.fileSourceStarted = false;

        if (this.fileBuffer) {
          this.fileSource.buffer = this.fileBuffer;
        } else {
          console.error('ファイルバッファが設定されていません');
          return;
        }

        // アナライザーと出力に接続
        if (this.analyser) {
          this.fileSource.connect(this.analyser);
          this.analyser.connect(this.audioContext.destination);
        } else {
          console.error('アナライザーが初期化されていません');
          return;
        }

        // 再生開始
        this.fileSource.start();
        this.fileSourceStarted = true;
        this.source = this.fileSource;
      } catch (error) {
        console.error('音声ファイルの再生開始に失敗しました:', error);
        throw error;
      }
    } else {
      console.error('AudioContextが初期化されていません');
    }
  }

  /**
   * リソースを解放する
   */
  dispose(): void {
    if (this.source) {
      this.source.disconnect();
    }
    
    if (this.fileSource) {
      try {
        if (this.fileSourceStarted) {
          this.fileSource.stop();
        }
        this.fileSource.disconnect();
      } catch (error) {
        console.warn('ファイルソースの停止または切断に失敗しました:', error);
      }
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
    this.fileSource = null;
    this.fileBuffer = null;
    this.isInitialized = false;
    this.fileSourceStarted = false;
  }
}

// シングルトンインスタンスをエクスポート
export const audioService = new AudioService();