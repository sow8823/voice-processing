/**
 * 周波数分析を担当するサービス
 */
export interface HarmonicAnalysisResult {
  spectralSlope: number;   // スペクトル傾斜（傾斜が急であるほどライトチェスト寄り、ゆるやかであるほどプル,ミックス寄り）
  bandPeakRatio: number;   // 特定の周波数帯域（2.8kHz～3.2kHz）の最大成分比率（%）
}

export class FrequencyAnalysisService {
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
        spectralSlope: 0,
        bandPeakRatio: 0
      };
    }

    const fftSize = frequencyData.length * 2;
    
    // 基本周波数のインデックスを計算
    const baseIdx = this.getFrequencyIndex(baseFrequency, sampleRate, fftSize);
    const baseAmp = frequencyData[baseIdx] || 1; // ゼロ除算を防ぐため、最小値を1とする
    
    // スペクトル傾斜を計算（Spectral Slope = ∑(fi - f̄)² / ∑(fi - f̄)(Ai - Ā)）
    
    // 有効な周波数範囲を決定（ノイズを避けるため、基本周波数から上限までを考慮）
    const slopeStartIdx = Math.max(1, baseIdx - 5); // 基本周波数の少し下から
    const slopeEndIdx = Math.min(frequencyData.length - 1, this.getFrequencyIndex(baseFrequency * 10, sampleRate, fftSize)); // 基本周波数の10倍まで
    
    // 周波数と振幅の配列を作成
    const frequencies: number[] = [];
    const amplitudes: number[] = [];
    
    for (let i = slopeStartIdx; i <= slopeEndIdx; i++) {
      // インデックスから周波数を計算
      const frequency = (i / fftSize) * sampleRate;
      // 対応する振幅を取得
      const amplitude = frequencyData[i];
      
      // 有効なデータのみを追加
      if (amplitude > 0) {
        frequencies.push(frequency);
        amplitudes.push(amplitude);
      }
    }
    
    // データが不足している場合は計算できない
    if (frequencies.length < 2) {
      return {
        spectralSlope: 0,
        bandPeakRatio: 0
      };
    }
    
    // 周波数と振幅の平均値を計算
    const freqMean = frequencies.reduce((sum, val) => sum + val, 0) / frequencies.length;
    const ampMean = amplitudes.reduce((sum, val) => sum + val, 0) / amplitudes.length;
    
    // 分子と分母を計算
    let numerator = 0;   // ∑(fi - f̄)²
    let denominator = 0; // ∑(fi - f̄)(Ai - Ā)
    
    for (let i = 0; i < frequencies.length; i++) {
      const freqDiff = frequencies[i] - freqMean;
      const ampDiff = amplitudes[i] - ampMean;
      
      numerator += freqDiff * freqDiff;
      denominator += freqDiff * ampDiff;
    }
    
    // ゼロ除算を防ぐ
    let spectralSlope = 0;
    if (denominator !== 0) {
      spectralSlope = numerator / denominator;
    }
    
    // 値を正規化（-1から1の範囲に収める）
    spectralSlope = Math.max(-1, Math.min(1, spectralSlope / 10000));
    
    // 使いやすいように0-1の範囲に変換（1に近いほど傾斜が急）
    spectralSlope = (1 - spectralSlope) / 2;
    
    // 2.8kHz～3.2kHzの周波数帯域の最大振幅を計算
    const bandStartIdx = this.getFrequencyIndex(2800, sampleRate, fftSize);
    const bandEndIdx = this.getFrequencyIndex(3200, sampleRate, fftSize);
    
    let maxAmp = 0;
    for (let i = bandStartIdx; i <= bandEndIdx; i++) {
      if (i < frequencyData.length && frequencyData[i] > maxAmp) {
        maxAmp = frequencyData[i];
      }
    }
    
    const bandPeakRatio = (maxAmp / baseAmp) * 100;
    
    return {
      spectralSlope,
      bandPeakRatio
    };
  }

  /**
   * 周波数データを指定された高さにスケーリングする
   * @param frequencyData 元の周波数データ
   * @param targetHeight 目標の高さ
   * @param maxFrequency 最大周波数（Hz）
   * @param sampleRate サンプリングレート
   * @returns スケーリングされた周波数データ
   */
  scaleFrequencyData(
    frequencyData: Uint8Array,
    targetHeight: number,
    maxFrequency: number = 10000,
    sampleRate: number = 44100
  ): Uint8Array {
    const nyquist = sampleRate / 2;
    const dataLength = Math.floor((maxFrequency / nyquist) * frequencyData.length);
    const filteredData = frequencyData.slice(0, dataLength);
    
    const scaledData = new Uint8Array(targetHeight);
    const scaleFactor = filteredData.length / targetHeight;
    
    for (let y = 0; y < targetHeight; y++) {
      // 周波数を反転させる（低周波数が下、高周波数が上）
      const invertedY = targetHeight - y - 1;
      const sourceIndex = Math.floor(y * scaleFactor);
      scaledData[invertedY] = filteredData[sourceIndex];
    }
    
    return scaledData;
  }

  /**
   * 周波数データの平均値を計算する
   * @param queue 周波数データのキュー
   * @returns 平均値
   */
  calculateAverage(queue: number[]): number {
    if (queue.length === 0) return 0;
    return queue.reduce((sum, val) => sum + val, 0) / queue.length;
  }
}

// シングルトンインスタンスをエクスポート
export const frequencyAnalysisService = new FrequencyAnalysisService();