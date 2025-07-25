/**
 * 周波数分析を担当するサービス
 */
export interface HarmonicAnalysisResult {
  spectralSlope: number;   // スペクトル傾斜（dB/oct）（-6～-10: 地声、-10～-13: 中間、-13～-18: 裏声）
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
    
    // スペクトル傾斜を計算（dB/oct単位）
    
    // 有効な周波数範囲を決定（ノイズを避けるため、基本周波数から上限までを考慮）
    const slopeStartIdx = Math.max(1, baseIdx - 5); // 基本周波数の少し下から
    const slopeEndIdx = Math.min(frequencyData.length - 1, this.getFrequencyIndex(baseFrequency * 10, sampleRate, fftSize)); // 基本周波数の10倍まで
    
    // 周波数と振幅の配列を作成（対数スケールに変換）
    const frequencies: number[] = [];
    const amplitudesDB: number[] = [];
    
    for (let i = slopeStartIdx; i <= slopeEndIdx; i++) {
      // インデックスから周波数を計算
      const frequency = (i / fftSize) * sampleRate;
      // 対応する振幅を取得
      const amplitude = frequencyData[i];
      
      // 有効なデータのみを追加
      if (amplitude > 0) {
        // 周波数をオクターブスケールに変換（log2）
        frequencies.push(Math.log2(frequency));
        // 振幅をdBスケールに変換（20 * log10）
        amplitudesDB.push(20 * Math.log10(amplitude / 255));
      }
    }
    
    // データが不足している場合は計算できない
    if (frequencies.length < 2) {
      return {
        spectralSlope: -10, // デフォルト値として中間的な値を設定
        bandPeakRatio: 0
      };
    }
    
    // 線形回帰で傾きを計算
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    const n = frequencies.length;
    
    for (let i = 0; i < n; i++) {
      sumX += frequencies[i];
      sumY += amplitudesDB[i];
      sumXY += frequencies[i] * amplitudesDB[i];
      sumX2 += frequencies[i] * frequencies[i];
    }
    
    // 傾き（dB/oct）を計算
    let spectralSlope = 0;
    if ((n * sumX2 - sumX * sumX) !== 0) {
      spectralSlope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    }
    
    // 値を範囲内に制限（-6～-18 dB/oct）
    spectralSlope = Math.max(-18, Math.min(-6, spectralSlope));
    
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
  /**
   * 周波数データを指定された高さにスケーリングする
   * 周波数軸方向の平滑化を完全に解除するため、各ピクセルに対応する範囲の最大値を使用
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
    
    // 各ピクセルに対応する元データの範囲を計算し、その範囲内の最大値を使用
    for (let y = 0; y < targetHeight; y++) {
      // 周波数を反転させる（低周波数が下、高周波数が上）
      const invertedY = targetHeight - y - 1;
      
      // このピクセルに対応する元データの範囲を計算
      const startIdx = Math.floor((y / targetHeight) * filteredData.length);
      const endIdx = Math.floor(((y + 1) / targetHeight) * filteredData.length);
      
      // 範囲内の最大値を取得
      let maxValue = 0;
      
      // startIdxとendIdxが同じ場合（データ範囲が空の場合）は、
      // 最も近い有効なデータポイントを使用する
      if (startIdx === endIdx) {
        // そのインデックスの値を直接使用
        if (startIdx < filteredData.length) {
          maxValue = filteredData[startIdx];
        }
      } else {
        // 通常通り範囲内の最大値を取得
        for (let i = startIdx; i < endIdx; i++) {
          if (i < filteredData.length && filteredData[i] > maxValue) {
            maxValue = filteredData[i];
          }
        }
      }
      
      // 最大値を使用（平滑化なし、ピークを保持）
      scaledData[invertedY] = maxValue;
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