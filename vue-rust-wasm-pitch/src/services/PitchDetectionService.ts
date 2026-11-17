/**
 * ピッチ検出を担当するサービス
 */
import init, { ProbabilisticMcLeodPitchDetector } from "../wasm/pitch_detection";

export interface PitchDetectionOptions {
  bufferSize: number;
  padding: number;
  powerThreshold: number;
  clarityThreshold: number;
}

export class PitchDetectionService {
  private detector: ProbabilisticMcLeodPitchDetector | null = null;
  private isInitialized = false;
  private options: PitchDetectionOptions;

  constructor(options?: Partial<PitchDetectionOptions>) {
    this.options = {
      bufferSize: 2048,
      padding: 1024,
      powerThreshold: 0.0001,
      clarityThreshold: 0.9,
      ...options
    };
  }

  /**
   * ピッチ検出サービスを初期化する
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // WebAssemblyモジュールを初期化
      await init();
      
      // ピッチ検出器を作成
      this.detector = new ProbabilisticMcLeodPitchDetector(
        this.options.bufferSize,
        this.options.padding
      );
      
      this.isInitialized = true;
    } catch (error) {
      console.error('ピッチ検出サービスの初期化に失敗しました:', error);
      throw error;
    }
  }

  /**
   * オーディオバッファからピッチを検出する
   * @param audioBuffer オーディオバッファ
   * @param sampleRate サンプリングレート
   * @param options オプション（省略可）
   * @returns 検出されたピッチ（Hz）、検出できない場合は0
   */
  detectPitch(
    audioBuffer: Float32Array,
    sampleRate: number,
    options?: Partial<Pick<PitchDetectionOptions, 'powerThreshold' | 'clarityThreshold'>>
  ): number {
    if (!this.isInitialized || !this.detector) {
      throw new Error('ピッチ検出サービスが初期化されていません');
    }

    const powerThreshold = options?.powerThreshold ?? this.options.powerThreshold;
    const clarityThreshold = options?.clarityThreshold ?? this.options.clarityThreshold;

    // 振幅のエネルギー（RMS）を計算
    const amplitude = this.calculateRMS(audioBuffer);

    // 振幅が閾値未満の場合は無音と判断
    if (amplitude < powerThreshold) {
      return 0;
    }

    // ピッチを検出
    const pitch = this.detector.detect_pitch(
      audioBuffer,
      sampleRate,
      powerThreshold,
      clarityThreshold
    );

    return pitch || 0;
  }

  /**
   * 振幅のエネルギー（RMS）を計算する
   * @param buffer オーディオバッファ
   * @returns RMS値
   */
  private calculateRMS(buffer: Float32Array): number {
    const sumSquares = buffer.reduce((sum, value) => sum + value * value, 0);
    return Math.sqrt(sumSquares / buffer.length);
  }

  /**
   * 周波数から音階名を取得する
   * @param frequency 周波数（Hz）
   * @returns 音階名（例: "A4"）
   */
  static frequencyToNoteName(frequency: number): string {
    if (frequency < 20) return '-';
    
    // A4 = 440Hz を基準に計算
    const a4 = 440;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    const noteNumber = 12 * (Math.log(frequency / a4) / Math.log(2));
    const roundedNoteNumber = Math.round(noteNumber);
    
    // 音階名を計算
    const octave = Math.floor((roundedNoteNumber + 9) / 12) + 4;
    // 負のインデックスを処理するために、12で割った余りを正の値に調整
    const noteIndex = ((roundedNoteNumber + 9) % 12 + 12) % 12;
    const noteName = noteNames[noteIndex];
    
    return `${noteName}${octave}`;
  }

  /**
   * リソースを解放する
   */
  dispose(): void {
    if (this.detector) {
      this.detector.free();
      this.detector = null;
    }
    this.isInitialized = false;
  }
}

// シングルトンインスタンスをエクスポート
export const pitchDetectionService = new PitchDetectionService();