/**
 * 周波数分析を担当するサービス
 */
export interface HarmonicAnalysisResult {
  harmonic2Ratio: number;  // 2倍音の強度比率（%）
  harmonic3Ratio: number;  // 3倍音の強度比率（%）
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