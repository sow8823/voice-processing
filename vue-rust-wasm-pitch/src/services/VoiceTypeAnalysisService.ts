/**
 * ボイスタイプ分析を担当するサービス
 */
import type { HarmonicAnalysisResult } from './FrequencyAnalysisService';

// 声区の定義
export type VoiceRegister = 'modal' | 'falsetto' | 'middle';

// ボイスタイプの定義を拡張（フリップとミックスを追加）
export type VoiceType = 'lightChest' | 'pull' | 'flip' | 'mixed' | 'unknown';

export interface VoiceTypeAnalysisResult {
  voiceType: VoiceType;
  confidence: number; // 0-1の範囲で分類の確信度
  parameters: {
    spectralSlope: number | {
      low: number;
      mid: number;
      high: number;
    }; // スペクトル傾斜（傾斜が急であるほどライトチェスト寄り、ゆるやかであるほどプル,ミックス寄り）
    highFrequencyRatio: number | {
      low: number;
      mid: number;
      high: number;
    };
    nonIntegerHarmonics: number | {
      low: number;
      mid: number;
      high: number;
    };
  };
  // 各音程ごとの分析結果
  pitchResults?: {
    [pitchId: string]: {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        nonIntegerHarmonics: number;
      };
    }
  };
  timeSegments?: {
    startTime: number;
    endTime: number;
    voiceType: VoiceType;
  }[];
}

// 性別ごとの音程セット定義
export interface PitchSet {
  id: string;
  name: string;
  frequency: number;
}

export type GenderPitchSets = {
  male: PitchSet[];
  female: PitchSet[];
};

export class VoiceTypeAnalysisService {
  // 音高と周波数のマッピング
  private noteFrequencyMap: Record<string, number> = {
    // A3 (57) から A5 (81) までの音高と周波数のマッピング
    "E3": 164.81,
    "A3": 220.00,
    "A#3": 233.08,
    "B3": 246.94,
    "C4": 261.63,
    "C#4": 277.18,
    "D4": 293.66,
    "D#4": 311.13,
    "E4": 329.63,
    "F4": 349.23,
    "F#4": 369.99,
    "G4": 392.00,
    "G#4": 415.30,
    "A4": 440.00,
    "A#4": 466.16,
    "B4": 493.88,
    "C5": 523.25,
    "C#5": 554.37,
    "D5": 587.33,
    "D#5": 622.25,
    "E5": 659.25,
    "F5": 698.46,
    "F#5": 739.99,
    "G5": 783.99,
    "G#5": 830.61,
    "A5": 880.00
  };

  // 性別ごとの音程セット
  private genderPitchSets: GenderPitchSets = {
    male: [
      { id: 'e3', name: 'E3', frequency: 164.81 },
      { id: 'e4', name: 'E4', frequency: 329.63 },
      { id: 'a4', name: 'A4', frequency: 440.00 }
    ],
    female: [
      { id: 'a3', name: 'A3', frequency: 220.00 },
      { id: 'a4', name: 'A4', frequency: 440.00 },
      { id: 'e5', name: 'E5', frequency: 659.25 }
    ]
  };

  
  /**
   * 2.5kHz以上の高周波成分の中で、基音に対して3分の1以上の強さを持つ成分があるかチェック
   * @param frequencyData 周波数データ
   * @param baseAmplitude 基音の振幅
   * @param minFrequency 最小周波数（Hz）
   * @param sampleRate サンプリングレート
   * @returns 強い高周波成分があるかどうか
   */
  hasStrongHighFrequencyComponents(
    frequencyData: Uint8Array,
    baseAmplitude: number,
    minFrequency: number,
    sampleRate: number
  ): boolean {
    const fftSize = frequencyData.length * 2;
    const minIndex = Math.floor((minFrequency / sampleRate) * fftSize);
    const threshold = baseAmplitude / 4; // 基音の4分の1の強さ（更新）
    
    // 基音の振幅が0または非常に小さい場合は判定できない
    if (baseAmplitude < 10) {
      return false;
    }
    
    for (let i = minIndex; i < frequencyData.length; i++) {
      if (frequencyData[i] >= threshold) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 高周波数帯域のエネルギー比率を計算する
   * @param frequencyData 周波数データ
   * @param sampleRate サンプリングレート
   * @returns 高周波数帯域のエネルギー比率
   */
  calculateHighFrequencyRatio(frequencyData: Uint8Array, sampleRate: number, targetFrequencyStart: number, targetFrequencyEnd: number, fundamentalFrequency?: number): number {
    const fftSize = frequencyData.length * 2;
    
    // 2kHz以上の周波数帯域のインデックスを計算
    const highFreqStartIdx = Math.floor((targetFrequencyStart / sampleRate) * fftSize);
    const highFreqEndIdx = Math.floor((targetFrequencyEnd / sampleRate) * fftSize);
    
    // 基音成分のインデックスと振幅を推定
    let baseAmp = 0;
    let baseIdx = 0;
    
    if (fundamentalFrequency) {
      // 決められた基音から±5%以内の周波数のうち、最も大きい振幅を持つ成分を基音成分とする
      const rangePercent = 0.04; // 4%
      const minFrequency = fundamentalFrequency * (1 - rangePercent);
      const maxFrequency = fundamentalFrequency * (1 + rangePercent);
      
      // 周波数インデックスの範囲を計算
      const minIndex = Math.floor((minFrequency / sampleRate) * fftSize);
      const maxIndex = Math.ceil((maxFrequency / sampleRate) * fftSize);
      
      // 範囲内で最も強いスペクトル成分を見つける
      for (let i = minIndex; i <= maxIndex; i++) {
        if (i >= 0 && i < frequencyData.length && frequencyData[i] > baseAmp) {
          baseAmp = frequencyData[i];
          baseIdx = i;
        }
      }
    } else {
      // fundamentalFrequencyが指定されていない場合は、低周波数帯域で最も強い成分を基音と見なす
      const lowFreqStartIdx = Math.floor((100 / sampleRate) * fftSize);
      const lowFreqEndIdx = Math.floor((1000 / sampleRate) * fftSize);
      
      for (let i = lowFreqStartIdx; i <= lowFreqEndIdx; i++) {
        if (i < frequencyData.length && frequencyData[i] > baseAmp) {
          baseAmp = frequencyData[i];
          baseIdx = i;
        }
      }
    }
    
    // 基音の振幅が0または非常に小さい場合は0を返す
    if (baseAmp < 10) return 0;
    // 2kHz以上の周波数帯域で最も強い成分を見つける
    let maxHighFreqAmp = 0;
    
    // for (let i = highFreqStartIdx; i < frequencyData.length; i++) {
    for (let i = highFreqStartIdx; i < highFreqEndIdx; i++) {
      if (frequencyData[i] > maxHighFreqAmp) {
        maxHighFreqAmp = frequencyData[i];
      }
    }
    
    // 2kHz以上の最大振幅成分の、基音成分に対する振幅比を計算
    // 比率が1（100%）を超えないように制限する
    // return Math.min(1.0, maxHighFreqAmp / baseAmp);
    return maxHighFreqAmp / baseAmp;
  }




  /**
   * 非整数次倍音の量を分析する
   * @param frequencyData 周波数データ
   * @param baseFrequency 基音周波数
   * @param sampleRate サンプリングレート
   * @returns 非整数次倍音の量（0-1）
   */
  analyzeNonIntegerHarmonics(
    frequencyData: Uint8Array,
    baseFrequency: number,
    sampleRate: number
  ): number {
    const fftSize = frequencyData.length * 2;
    console.log('fftSize:', fftSize);
    // 整数次倍音のインデックスを計算
    const harmonicIndices: number[] = [];
    const harmonicWidth = Math.max(2, Math.floor(baseFrequency / 50)); // 倍音の幅（周波数が高いほど広く）
    
    // 基音から2000Hzまでの整数次倍音のインデックスを計算
    let i = 1;
    let harmonicFreq = baseFrequency * i;
    
    // 2000Hz以下の整数次倍音を計算
    while (harmonicFreq <= 2000) {
      const harmonicIdx = Math.floor((harmonicFreq / sampleRate) * fftSize);
      
      const rangePercent = 0.04; // 4%
      const minFrequency = harmonicFreq * (1 - rangePercent);
      const maxFrequency = harmonicFreq * (1 + rangePercent);
      
      // 周波数インデックスの範囲を計算
      const minIndex = Math.floor((minFrequency / sampleRate) * fftSize);
      const maxIndex = Math.ceil((maxFrequency / sampleRate) * fftSize);
      // 範囲内のインデックスを追加
      for (let i = minIndex; i <= maxIndex; i++) {
        if (i >= 0 && i < frequencyData.length) {
          harmonicIndices.push(i);
        }
      }
      // // 倍音の周辺も含める
      // for (let j = -harmonicWidth; j <= harmonicWidth; j++) {
      //   const idx = harmonicIdx + j;
      //   if (idx >= 0 && idx < frequencyData.length) {
      //     harmonicIndices.push(idx);
      //   }
      // }
      
      // 次の倍音へ
      i++;
      harmonicFreq = baseFrequency * i;
    }
    
    // 整数次倍音のエネルギー
    let harmonicEnergy = 0;
    for (const idx of harmonicIndices) {
      harmonicEnergy += frequencyData[idx] * frequencyData[idx];
    }
    
    // 全体のエネルギー
    let totalEnergy = 0;
    // for (let i = 0; i < frequencyData.length; i++) {
    for (let i = 0; i < Math.floor((2000 / sampleRate) * fftSize); i++) {
      totalEnergy += frequencyData[i] * frequencyData[i];
    }
    
    // 非整数次倍音のエネルギー比率を計算
    const nonIntegerHarmonicRatio = totalEnergy > 0 ? 1 - (harmonicEnergy / totalEnergy) : 0;
    
    return nonIntegerHarmonicRatio;
  }

  /**
   * 低音の分析を行う関数
   * @param frequencyDataArray 周波数データの配列
   * @param pitch 音程情報
   * @param sampleRate サンプリングレート
   * @returns 分析結果
   */
  analyzeLowPitch(
    frequencyDataArray: Uint8Array[],
    pitch: PitchSet,
    sampleRate: number
  ): {
    voiceRegister: VoiceRegister;
    parameters: {
      spectralSlope: number;
      highFrequencyRatio: number;
      nonIntegerHarmonics: number;
    };
  } {
    // 複数フレームの平均値を計算
    let totalSpectralSlope = 0;
    let totalHighFrequencyRatio = 0;
    let validFrameCount = 0;
    let totalNonIntegerHarmonics = 0;
    
    // 各フレームを分析
    for (const freqData of frequencyDataArray) {
      // 基本パラメータの計算
      const baseFrequency = this.findStrongestFrequencyComponent(
        freqData,
        pitch.frequency,
        sampleRate,
        0.05
      );
      
      const harmonicResult = this.analyzeHarmonicComponents(
        freqData,
        baseFrequency,
        sampleRate
      );
      
      const highFrequencyRatio = this.calculateHighFrequencyRatio(freqData, sampleRate, 2000, 5000, pitch.frequency);

      // 非整数次倍音を分析
      const nonIntegerHarmonics = this.analyzeNonIntegerHarmonics(freqData, pitch.frequency, sampleRate);
      // 基音の振幅を計算
      const fftSize = freqData.length * 2;
      const baseIdx = Math.round((pitch.frequency / sampleRate) * fftSize);
      const baseAmplitude = baseIdx < freqData.length ? freqData[baseIdx] : 0;
      
      // 有効なフレームのみ集計（無音部分も除外）
      if (!isNaN(harmonicResult.spectralSlope) &&
          !isNaN(highFrequencyRatio) &&
          !isNaN(nonIntegerHarmonics) &&
          baseAmplitude >= 10) { // 振幅が4以上あるかチェック
        totalSpectralSlope += harmonicResult.spectralSlope;
        totalHighFrequencyRatio += highFrequencyRatio;
        totalNonIntegerHarmonics += nonIntegerHarmonics;
        validFrameCount++;
      }
    }
    
    // 有効なフレームがない場合はデフォルト値を設定
    if (validFrameCount === 0) {
      validFrameCount = 1; // ゼロ除算を防ぐ
      totalSpectralSlope = 0; // 中間的な値
      totalHighFrequencyRatio = 0.2;
      totalNonIntegerHarmonics = 0.3;
    }
    
    // 平均値を計算
    const avgSpectralSlope = totalSpectralSlope / validFrameCount;
    const avgHighFrequencyRatio = totalHighFrequencyRatio / validFrameCount;
    const avgNonIntegerHarmonics = totalNonIntegerHarmonics / validFrameCount;
    
    // スペクトル傾斜による判定
    const isChestBySlope = avgSpectralSlope >= -8 && avgSpectralSlope <= -2;
    const isMiddleBySlope = avgSpectralSlope < -8 && avgSpectralSlope >= -11;
    const isFalsettoBySlope = avgSpectralSlope < -11;
    
    // 高周波成分の強度による判定
    const hasStrongHighFreq = avgHighFrequencyRatio >= 0.3;
    
    // 総合判定
    let voiceRegister: VoiceRegister = 'middle';
    if (isChestBySlope && hasStrongHighFreq) {
      voiceRegister = 'modal';
    } else if (hasStrongHighFreq) {
      voiceRegister = 'middle';
    } else {
      voiceRegister = 'falsetto';
    }
    
    return {
      voiceRegister,
      parameters: {
        spectralSlope: avgSpectralSlope,
        highFrequencyRatio: avgHighFrequencyRatio,
        nonIntegerHarmonics: avgNonIntegerHarmonics
      }
    };
  }

  /**
   * 中音の分析を行う関数
   * @param frequencyDataArray 周波数データの配列
   * @param pitch 音程情報
   * @param sampleRate サンプリングレート
   * @returns 分析結果
   */
  analyzeMidPitch(
    frequencyDataArray: Uint8Array[],
    pitch: PitchSet,
    sampleRate: number
  ): {
    voiceRegister: VoiceRegister;
    parameters: {
      spectralSlope: number;
      highFrequencyRatio: number;
      nonIntegerHarmonics: number;
    };
  } {
    // 複数フレームの平均値を計算
    let totalSpectralSlope = 0;
    let totalHighFrequencyRatio = 0;
    let totalNonIntegerHarmonics = 0;
    let validFrameCount = 0;
    
    // 各フレームを分析
    for (const freqData of frequencyDataArray) {
      // 基本パラメータの計算
      const baseFrequency = this.findStrongestFrequencyComponent(
        freqData,
        pitch.frequency,
        sampleRate,
        0.05
      );
      
      const harmonicResult = this.analyzeHarmonicComponents(
        freqData,
        baseFrequency,
        sampleRate
      );
      
      const highFrequencyRatio = this.calculateHighFrequencyRatio(freqData, sampleRate, 2000, 5000, pitch.frequency);
      // 非整数次倍音を分析
      const nonIntegerHarmonics = this.analyzeNonIntegerHarmonics(freqData, pitch.frequency, sampleRate);
      
      // 基音の振幅を計算
      const fftSize = freqData.length * 2;
      const baseIdx = Math.round((pitch.frequency / sampleRate) * fftSize);
      const baseAmplitude = baseIdx < freqData.length ? freqData[baseIdx] : 0;
      
      // 有効なフレームのみ集計（無音部分も除外）
      if (!isNaN(harmonicResult.spectralSlope) &&
          !isNaN(highFrequencyRatio) &&
          !isNaN(nonIntegerHarmonics) &&
          baseAmplitude >= 4) { // 振幅が4以上あるかチェック
        totalSpectralSlope += harmonicResult.spectralSlope;
        totalHighFrequencyRatio += highFrequencyRatio;
        totalNonIntegerHarmonics += nonIntegerHarmonics;
        validFrameCount++;
      }
    }
    
    // 有効なフレームがない場合はデフォルト値を設定
    if (validFrameCount === 0) {
      validFrameCount = 1; // ゼロ除算を防ぐ
      totalSpectralSlope = 0; // 中間的な値
      totalHighFrequencyRatio = 0;
      totalNonIntegerHarmonics = 0;
    }
    
    // 平均値を計算
    const avgSpectralSlope = totalSpectralSlope / validFrameCount;
    const avgHighFrequencyRatio = totalHighFrequencyRatio / validFrameCount;
    const avgNonIntegerHarmonics = totalNonIntegerHarmonics / validFrameCount;
    
    // スペクトル傾斜による判定
    const isChestBySlope = avgSpectralSlope >= -8 && avgSpectralSlope <= -2;
    const isMiddleBySlope = avgSpectralSlope < -8 && avgSpectralSlope >= -11;
    const isFalsettoBySlope = avgSpectralSlope < -11;
    
    // 高周波成分の強度による判定
    const hasStrongHighFreq = avgHighFrequencyRatio >= 0.3;
    
    // 総合判定
    let voiceRegister: VoiceRegister = 'middle';
    if (isChestBySlope && hasStrongHighFreq) {
      voiceRegister = 'modal';
    } else if (hasStrongHighFreq) {
      voiceRegister = 'middle';
    } else {
      voiceRegister = 'falsetto';
    }
    
    return {
      voiceRegister,
      parameters: {
        spectralSlope: avgSpectralSlope,
        highFrequencyRatio: avgHighFrequencyRatio,
        nonIntegerHarmonics: avgNonIntegerHarmonics
      }
    };
  }

  /**
   * 高音の分析を行う関数
   * @param frequencyDataArray 周波数データの配列
   * @param pitch 音程情報
   * @param sampleRate サンプリングレート
   * @returns 分析結果
   */
  analyzeHighPitch(
    frequencyDataArray: Uint8Array[],
    pitch: PitchSet,
    sampleRate: number
  ): {
    voiceRegister: VoiceRegister;
    parameters: {
      spectralSlope: number;
      highFrequencyRatio: number;
      nonIntegerHarmonics: number;
    };
  } {
    // 複数フレームの平均値を計算
    let totalSpectralSlope = 0;
    let totalHighFrequencyRatio = 0;
    let validFrameCount = 0;
    let totalNonIntegerHarmonics = 0;
    
    // 各フレームを分析
    for (const freqData of frequencyDataArray) {
      // 基本パラメータの計算
      const baseFrequency = this.findStrongestFrequencyComponent(
        freqData,
        pitch.frequency,
        sampleRate,
        0.05
      );
      
      const harmonicResult = this.analyzeHarmonicComponents(
        freqData,
        baseFrequency,
        sampleRate
      );
      
      const highFrequencyRatio = this.calculateHighFrequencyRatio(freqData, sampleRate, 2000, 5000, pitch.frequency);
      // 非整数次倍音を分析
      const nonIntegerHarmonics = this.analyzeNonIntegerHarmonics(freqData, pitch.frequency, sampleRate);
      
      // 基音の振幅を計算
      const fftSize = freqData.length * 2;
      const baseIdx = Math.round((pitch.frequency / sampleRate) * fftSize);
      const baseAmplitude = baseIdx < freqData.length ? freqData[baseIdx] : 0;
      
      // 有効なフレームのみ集計（無音部分も除外）
      if (!isNaN(harmonicResult.spectralSlope) &&
          !isNaN(highFrequencyRatio) &&
          !isNaN(nonIntegerHarmonics) &&
          baseAmplitude >= 4) { // 振幅が4以上あるかチェック
        totalSpectralSlope += harmonicResult.spectralSlope;
        totalHighFrequencyRatio += highFrequencyRatio;
        totalNonIntegerHarmonics += nonIntegerHarmonics;
        validFrameCount++;
      }
    }
    
    // 有効なフレームがない場合はデフォルト値を設定
    if (validFrameCount === 0) {
      validFrameCount = 1; // ゼロ除算を防ぐ
      totalSpectralSlope = 0; // 中間的な値
      totalHighFrequencyRatio = 0.2;
      totalNonIntegerHarmonics = 0.3;
    }
    
    // 平均値を計算
    const avgSpectralSlope = totalSpectralSlope / validFrameCount;
    const avgHighFrequencyRatio = totalHighFrequencyRatio / validFrameCount;
    const avgNonIntegerHarmonics = totalNonIntegerHarmonics / validFrameCount;

    // スペクトル傾斜による判定
    const isChestBySlope = avgSpectralSlope >= -8 && avgSpectralSlope <= -2;
    const isMiddleBySlope = avgSpectralSlope < -8 && avgSpectralSlope >= -11;
    const isFalsettoBySlope = avgSpectralSlope < -11;
    
    // 高周波成分の強度による判定
    const hasStrongHighFreq = avgHighFrequencyRatio >= 0.3;
    
    // 総合判定
    let voiceRegister: VoiceRegister = 'middle';
    if (isChestBySlope && hasStrongHighFreq) {
      voiceRegister = 'modal';
    } else if (hasStrongHighFreq) {
      voiceRegister = 'middle';
    } else {
      voiceRegister = 'falsetto';
    }
    
    return {
      voiceRegister,
      parameters: {
        spectralSlope: avgSpectralSlope,
        highFrequencyRatio: avgHighFrequencyRatio,
        nonIntegerHarmonics: avgNonIntegerHarmonics
      }
    };
  }

  /**
   * 複数の音程の音声を分析してボイスタイプを段階的に判定する
   * @param frequencyDataArrays 各音程の周波数データ配列のマップ
   * @param pitchDataArrays 各音程のピッチデータ配列のマップ
   * @param timestampsArrays 各音程のタイムスタンプ配列のマップ
   * @param sampleRate サンプリングレート
   * @param gender 性別（'male'または'female'）
   * @returns ボイスタイプ分析結果
   */
  analyzeMultiplePitches(
    frequencyDataArrays: Record<string, Uint8Array[]>,
    // pitchDataArrays: Record<string, number[]>,
    // timestampsArrays: Record<string, number[]>,
    sampleRate: number,
    gender: 'male' | 'female'
  ): VoiceTypeAnalysisResult {
    // 結果変数
    let finalVoiceType: VoiceType = 'unknown';
    let confidence = 0.5;
    
    // 使用する音程セット
    const pitchSet = this.genderPitchSets[gender];
    const lowPitch = pitchSet[0];  // 最低音
    const midPitch = pitchSet[1];  // 中間音
    const highPitch = pitchSet[2]; // 最高音
    
    // 各音程のデータを取得
    const lowPitchFreqDataArray = frequencyDataArrays[lowPitch.id];
    const midPitchFreqDataArray = frequencyDataArrays[midPitch.id];
    const highPitchFreqDataArray = frequencyDataArrays[highPitch.id];
    
    // データが不足している場合は不明として処理
    if (!lowPitchFreqDataArray || !midPitchFreqDataArray || !highPitchFreqDataArray ||
        lowPitchFreqDataArray.length === 0 || midPitchFreqDataArray.length === 0 || highPitchFreqDataArray.length === 0) {
      return {
        voiceType: 'unknown',
        confidence: 0,
        parameters: {
          spectralSlope: 0,
          highFrequencyRatio: 0,
          nonIntegerHarmonics: 0
        }
      };
    }
    
    // 各音程の分析結果を格納するオブジェクト
    const pitchResults: Record<string, {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        nonIntegerHarmonics: number;
      };
      voiceRegister: VoiceRegister;
    }> = {};
    
    // 低音の分析
    const lowPitchAnalysis = this.analyzeLowPitch(
      lowPitchFreqDataArray,
      lowPitch,
      sampleRate
    );
    
    // 結果を保存
    pitchResults[lowPitch.id] = {
      voiceType: 'unknown', // 仮の値
      confidence: 0.8,
      parameters: {
        spectralSlope: lowPitchAnalysis.parameters.spectralSlope,
        highFrequencyRatio: lowPitchAnalysis.parameters.highFrequencyRatio,
        nonIntegerHarmonics: lowPitchAnalysis.parameters.nonIntegerHarmonics
      },
      voiceRegister: lowPitchAnalysis.voiceRegister
    };
    
    // 中音の分析
    const midPitchAnalysis = this.analyzeMidPitch(
      midPitchFreqDataArray,
      midPitch,
      sampleRate
    );
    
    // 結果を保存
    pitchResults[midPitch.id] = {
      voiceType: 'unknown', // 仮の値
      confidence: 0.8,
      parameters: {
        spectralSlope: midPitchAnalysis.parameters.spectralSlope,
        highFrequencyRatio: midPitchAnalysis.parameters.highFrequencyRatio,
        nonIntegerHarmonics: midPitchAnalysis.parameters.nonIntegerHarmonics
      },
      voiceRegister: midPitchAnalysis.voiceRegister
    };
    
    const avgMidNonIntegerHarmonics = midPitchAnalysis.parameters.nonIntegerHarmonics || 0;
    
    // 高音の分析
    const highPitchAnalysis = this.analyzeHighPitch(
      highPitchFreqDataArray,
      highPitch,
      sampleRate
    );
    
    // 結果を保存
    pitchResults[highPitch.id] = {
      voiceType: 'unknown', // 仮の値
      confidence: 0.8,
      parameters: {
        spectralSlope: highPitchAnalysis.parameters.spectralSlope,
        highFrequencyRatio: highPitchAnalysis.parameters.highFrequencyRatio,
        nonIntegerHarmonics: highPitchAnalysis.parameters.nonIntegerHarmonics,
      },
      voiceRegister: highPitchAnalysis.voiceRegister
    };
    
    // 各音程のパラメータを取得
    const lowPitchParams = pitchResults[lowPitch.id].parameters;
    const midPitchParams = pitchResults[midPitch.id].parameters;
    const highPitchParams = pitchResults[highPitch.id].parameters;
    
    // 全ての音程のパラメータを含むオブジェクトを作成
    const avgParameters = {
      spectralSlope: {
        low: lowPitchParams.spectralSlope,
        mid: midPitchParams.spectralSlope,
        high: highPitchParams.spectralSlope
      },
      highFrequencyRatio: {
        low: lowPitchParams.highFrequencyRatio,
        mid: midPitchParams.highFrequencyRatio,
        high: highPitchParams.highFrequencyRatio
      },
      nonIntegerHarmonics: {
        low: lowPitchParams.nonIntegerHarmonics,
        mid: midPitchParams.nonIntegerHarmonics,
        high: highPitchParams.nonIntegerHarmonics
      }
    };
    
    // 全ての音程の分析が完了した後に、それらの分析結果から最終的な分類を行う
    
    // 第1音程（低音）の判定
    const lowVoiceRegister = lowPitchAnalysis.voiceRegister;
    
    // 第2音程（中音）の判定
    const midVoiceRegister = midPitchAnalysis.voiceRegister;
    
    // 第3音程（高音）の判定
    const highVoiceRegister = highPitchAnalysis.voiceRegister;
    
    // 分類条件（優先順位順）
    
      console.log('Unknown voice type based on analysis');
      console.log('Low Pitch:', lowVoiceRegister);
      console.log('Mid Pitch:', midVoiceRegister);
      console.log('High Pitch:', highVoiceRegister);
      console.log('Avg Non-Integer Harmonics:', avgMidNonIntegerHarmonics);
      console.log('Avg highFrequencyRatioLow:', avgParameters.highFrequencyRatio.low);
      console.log('Avg highFrequencyRatioMid:', avgParameters.highFrequencyRatio.mid);
      console.log('Avg highFrequencyRatioHigh:', avgParameters.highFrequencyRatio.high);
    // 1. 第1音程が中間または裏声の場合 → ライトチェスト
    if (lowVoiceRegister === 'middle' || lowVoiceRegister === 'falsetto') {
      finalVoiceType = 'lightChest';
      confidence = 0.8;
    }
    // 2. 第2音程の4kHz周辺の成分が強く、非整数次倍音が多い場合 → プル
    else if (lowVoiceRegister === 'modal') {
      // 3. 第2音程が中間または裏声の場合 → フリップ
      // if ((midVoiceRegister === 'falsetto' || avgParameters.highFrequencyRatio.mid < 0.4)) {
      if (midVoiceRegister === 'falsetto') {
        finalVoiceType = 'flip';
        confidence = 0.8;
      }
      else if (midVoiceRegister === 'middle' || midVoiceRegister === 'modal') {
        if (avgMidNonIntegerHarmonics >= 0.3) {
          finalVoiceType = 'pull';
          confidence = 0.8;
        }
        else if (avgParameters.highFrequencyRatio.mid < 0.4) {
          finalVoiceType = 'flip';
          confidence = 0.8;
        }
        else {
          if (highVoiceRegister === 'modal' || highVoiceRegister === 'middle') {
            if (highPitchParams.nonIntegerHarmonics >= 0.3) {
              finalVoiceType = 'pull';
              confidence = 0.8;
            }
            else {
              finalVoiceType = 'mixed';
              confidence = 0.8;
            }
          }
          // 5. 第3音程が中間または裏声の場合 → フリップ
          else if (highVoiceRegister === 'falsetto') {
            finalVoiceType = 'flip';
            confidence = 0.8;
          }
        }
      }
    }

    // 4. 第3音程の3kHz周辺の音が強い場合 → ミックス
    
    // 6. それ以外の場合 → unknown
    else {
      finalVoiceType = 'unknown';
      confidence = 0.5;
    }
    
    return {
      voiceType: finalVoiceType,
      confidence: confidence,
      parameters: {
        spectralSlope: avgParameters.spectralSlope,
        highFrequencyRatio: avgParameters.highFrequencyRatio,
        nonIntegerHarmonics: avgParameters.nonIntegerHarmonics,
      },
      pitchResults
    };
  }
  

  /**
   * 指定された周波数の周辺（±範囲）で最も強いスペクトル成分を見つける
   * @param frequencyData 周波数データ
   * @param targetFrequency 対象の周波数
   * @param sampleRate サンプリングレート
   * @param rangePercent 検索範囲（割合）
   * @returns 最も強いスペクトル成分の周波数
   */
  findStrongestFrequencyComponent(
    frequencyData: Uint8Array,
    targetFrequency: number,
    sampleRate: number,
    rangePercent: number = 0.05
  ): number {
    const fftSize = frequencyData.length * 2;
    
    // 周波数の範囲を計算
    const minFrequency = targetFrequency * (1 - rangePercent);
    const maxFrequency = targetFrequency * (1 + rangePercent);
    
    // 周波数インデックスの範囲を計算
    const minIndex = Math.floor((minFrequency / sampleRate) * fftSize);
    const maxIndex = Math.ceil((maxFrequency / sampleRate) * fftSize);
    
    // 範囲内で最も強いスペクトル成分を見つける
    let maxAmplitude = 0;
    let maxAmplitudeIndex = Math.floor((targetFrequency / sampleRate) * fftSize); // デフォルトは対象の周波数
    
    for (let i = minIndex; i <= maxIndex; i++) {
      if (i >= 0 && i < frequencyData.length && frequencyData[i] > maxAmplitude) {
        maxAmplitude = frequencyData[i];
        maxAmplitudeIndex = i;
      }
    }
    
    // 周波数に変換
    const strongestFrequency = (maxAmplitudeIndex / fftSize) * sampleRate;
    
    return strongestFrequency;
  }

  /**
   * 検出された基音成分と倍音成分を使用して倍音分析を行う
   * @param frequencyData 周波数データ
   * @param baseFrequency 基音成分の周波数
   * @param harmonic2Frequency 第2倍音成分の周波数
   * @param harmonic3Frequency 第3倍音成分の周波数
   * @param sampleRate サンプリングレート
   * @returns 倍音分析結果
   */
  analyzeHarmonicComponents(
    frequencyData: Uint8Array,
    baseFrequency: number,
    sampleRate: number
  ): HarmonicAnalysisResult {
    const fftSize = frequencyData.length * 2;
    
    // 基音周波数のインデックスを計算
    const baseIdx = Math.round((baseFrequency / sampleRate) * fftSize);
    
    // 基音の振幅が0または非常に小さい場合は0を返す（ゼロ除算を防ぐ）
    const baseAmp = baseIdx < frequencyData.length ? frequencyData[baseIdx] : 0;
    if (baseAmp < 10) {
      return {
        spectralSlope: 0,
        bandPeakRatio: 0,
        highFreqRatio: 0
      };
    }
    
    // スペクトル傾斜を計算（dB/oct単位）
    
    // 有効な周波数範囲を決定（ノイズを避けるため、基本周波数から上限までを考慮）
    const slopeStartIdx = Math.max(1, baseIdx - 5); // 基本周波数の少し下から
    // const slopeEndIdx = Math.min(frequencyData.length - 1, Math.round((baseFrequency * 10 / sampleRate) * fftSize)); // 基本周波数の10倍まで
    const slopeEndIdx = Math.min(frequencyData.length - 1, Math.round((2000 / sampleRate) * fftSize)); // 基本周波数の10倍まで
    
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
    console.log('Frequencies:', frequencies);
    // データが不足している場合は計算できない
    if (frequencies.length < 2) {
      console.log('baseFrequency:', baseFrequency);
      console.log('Insufficient data for spectral slope calculation');
      return {
        spectralSlope: 0,
        bandPeakRatio: 0,
        highFreqRatio: 0
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
    
    // 値範囲の制限をなくすと、外れ値に対応できなくなる可能性があるため、制限を維持
    spectralSlope = Math.max(-30, Math.min(-2, spectralSlope));
    
    // 3kHz周辺の周波数帯域の最大振幅を計算
    const bandStartIdx = Math.floor((2800 / sampleRate) * fftSize);
    const bandEndIdx = Math.ceil((3200 / sampleRate) * fftSize);
    
    let maxAmp = 0;
    for (let i = bandStartIdx; i <= bandEndIdx; i++) {
      if (i >= 0 && i < frequencyData.length && frequencyData[i] > maxAmp) {
        maxAmp = frequencyData[i];
      }
    }
    
    const bandPeakRatio = Math.min(100, (maxAmp / baseAmp) * 100);
    
    // 2.5kHz～6kHzの周波数帯域の最大振幅を計算
    const highFreqStartIdx = Math.floor((2500 / sampleRate) * fftSize);
    const highFreqEndIdx = Math.ceil((6000 / sampleRate) * fftSize);
    
    let highFreqMaxAmp = 0;
    for (let i = highFreqStartIdx; i <= highFreqEndIdx; i++) {
      if (i >= 0 && i < frequencyData.length && frequencyData[i] > highFreqMaxAmp) {
        highFreqMaxAmp = frequencyData[i];
      }
    }
    
    const highFreqRatio = Math.min(100, (highFreqMaxAmp / baseAmp) * 100);
    
    console.log('Spectral Slope:', spectralSlope);
    return {
      spectralSlope,
      bandPeakRatio,
      highFreqRatio
    };
  }
}