/**
 * ボイスタイプ分析を担当するサービス
 */
import type { HarmonicAnalysisResult } from './FrequencyAnalysisService';

// 声区の定義
export type VoiceRegister = 'chest' | 'falsetto' | 'middle';

// ボイスタイプの定義を拡張（フリップとミックスを追加）
export type VoiceType = 'lightChest' | 'pull' | 'flip' | 'mixed' | 'unknown';

export interface VoiceTypeAnalysisResult {
  voiceType: VoiceType;
  confidence: number; // 0-1の範囲で分類の確信度
  parameters: {
    spectralSlope: number; // スペクトル傾斜（傾斜が急であるほどライトチェスト寄り、ゆるやかであるほどプル,ミックス寄り）
    highFrequencyRatio: number;
    noiseRatio: number;
    // 新しいパラメータ
    voiceConsistency?: number; // 音程間の声質一貫性（ミックスの特徴）
    pitchAccuracy?: number; // 音程精度（プルはフラット傾向）
    voiceQualityChange?: number; // 声質変化の度合い（フリップの特徴）
    brightness3kHz?: number; // 3kHz周辺の強さ（ミックスの特徴）
  };
  // 各音程ごとの分析結果
  pitchResults?: {
    [pitchId: string]: {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
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
   * 複数の音程の音声を分析してボイスタイプを総合的に判定する
   * @param audioBuffers 各音程のAudioBufferのマップ
   * @param frequencyDataArrays 各音程の周波数データ配列のマップ
   * @param pitchDataArrays 各音程のピッチデータ配列のマップ
   * @param timestampsArrays 各音程のタイムスタンプ配列のマップ
   * @param sampleRate サンプリングレート
   * @param gender 性別（'male'または'female'）
   * @returns ボイスタイプ分析結果
   */
  /**
   * 地声/裏声を診断する
   * @param frequencyData 周波数データ
   * @param baseFrequency 基音周波数
   * @param sampleRate サンプリングレート
   * @returns 'chest'（地声）, 'falsetto'（裏声）, 'middle'（中間）のいずれか
   */
  diagnoseVoiceRegister(
    frequencyData: Uint8Array,
    baseFrequency: number,
    sampleRate: number
  ): VoiceRegister {
    // 1. スペクトル傾斜の分析
    // 基音成分の2倍、3倍の周波数帯で最も強い成分を見つける
    const harmonic2Frequency = this.findStrongestFrequencyComponent(
      frequencyData,
      baseFrequency * 2,
      sampleRate,
      0.05 // 5%の範囲
    );
    
    const harmonic3Frequency = this.findStrongestFrequencyComponent(
      frequencyData,
      baseFrequency * 3,
      sampleRate,
      0.05 // 5%の範囲
    );
    
    // 倍音分析を実行
    const harmonicResult = this.analyzeHarmonicComponents(
      frequencyData,
      baseFrequency,
      sampleRate
    );
    
    // スペクトル傾斜による判定（更新された基準）
    // -2～-10: 地声傾向、-10～-13: 中間傾向、-13～-30: 裏声傾向
    const spectralSlope = harmonicResult.spectralSlope;
    const isChestBySlope = spectralSlope >= -10 && spectralSlope <= -2;
    const isMiddleBySlope = spectralSlope < -10 && spectralSlope >= -13;
    const isFalsettoBySlope = spectralSlope < -13;
    
    // 2. 高周波成分の強度チェック（更新された基準）
    const baseIdx = Math.round((baseFrequency / sampleRate) * (frequencyData.length * 2));
    const baseAmp = baseIdx < frequencyData.length ? frequencyData[baseIdx] : 0;
    const hasStrongHighFreq = this.hasStrongHighFrequencyComponents(
      frequencyData,
      baseAmp,
      2000, // 2.0kHz（更新）
      sampleRate
    );
    
    // 3. 総合判定（更新された基準）
    if (isChestBySlope && hasStrongHighFreq) {
      // 両方の条件で地声傾向
      return 'chest';
    } else if (!hasStrongHighFreq) {
      // 高周波成分の強度で裏声傾向
      return 'falsetto';
    } else {
      // 高周波成分の強度で地声傾向かつスペクトル傾斜で裏声傾向または中間傾向
      return 'middle';
    }
  }
  
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
   * 特定の周波数帯域の強度を分析する
   * @param frequencyData 周波数データ
   * @param minFrequency 最小周波数（Hz）
   * @param maxFrequency 最大周波数（Hz）
   * @param sampleRate サンプリングレート
   * @returns 強度（0-1）
   */
  analyzeFrequencyBandStrength(
    frequencyData: Uint8Array,
    minFrequency: number,
    maxFrequency: number,
    sampleRate: number
  ): number {
    const fftSize = frequencyData.length * 2;
    const minIndex = Math.floor((minFrequency / sampleRate) * fftSize);
    const maxIndex = Math.ceil((maxFrequency / sampleRate) * fftSize);
    
    // 帯域内の最大振幅を検索
    let maxAmp = 0;
    for (let i = minIndex; i <= maxIndex; i++) {
      if (i >= 0 && i < frequencyData.length && frequencyData[i] > maxAmp) {
        maxAmp = frequencyData[i];
      }
    }
    
    // 全体の最大振幅を検索
    let totalMaxAmp = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      if (frequencyData[i] > totalMaxAmp) {
        totalMaxAmp = frequencyData[i];
      }
    }
    
    // 相対的な強度を計算（0-1）
    return totalMaxAmp > 0 ? maxAmp / totalMaxAmp : 0;
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
    
    // 整数次倍音のインデックスを計算
    const harmonicIndices: number[] = [];
    const harmonicWidth = Math.max(2, Math.floor(baseFrequency / 50)); // 倍音の幅（周波数が高いほど広く）
    
    // 基音から2000Hzまでの整数次倍音のインデックスを計算
    let i = 1;
    let harmonicFreq = baseFrequency * i;
    
    // 2000Hz以下の整数次倍音を計算
    while (harmonicFreq <= 2000) {
      const harmonicIdx = Math.floor((harmonicFreq / sampleRate) * fftSize);
      
      // 倍音の周辺も含める
      for (let j = -harmonicWidth; j <= harmonicWidth; j++) {
        const idx = harmonicIdx + j;
        if (idx >= 0 && idx < frequencyData.length) {
          harmonicIndices.push(idx);
        }
      }
      
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
    for (let i = 0; i < frequencyData.length; i++) {
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
      noiseRatio: number;
      nonIntegerHarmonics: number;
    };
  } {
    // 複数フレームの平均値を計算
    let totalSpectralSlope = 0;
    let totalHighFrequencyRatio = 0;
    let totalNoiseRatio = 0;
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
      
      const highFrequencyRatio = this.calculateHighFrequencyRatio(freqData, sampleRate, pitch.frequency);
      const noiseRatio = this.estimateNoiseRatio(freqData, baseFrequency, sampleRate);
      
      const nonIntegerHarmonics = this.analyzeNonIntegerHarmonics(freqData, pitch.frequency, sampleRate);
      // 有効なフレームのみ集計
      if (!isNaN(harmonicResult.spectralSlope) && !isNaN(highFrequencyRatio) && !isNaN(noiseRatio)) {
        totalSpectralSlope += harmonicResult.spectralSlope;
        totalHighFrequencyRatio += highFrequencyRatio;
        totalNoiseRatio += noiseRatio;
        totalNonIntegerHarmonics += nonIntegerHarmonics;
        validFrameCount++;
      }
    }
    
    // 有効なフレームがない場合はデフォルト値を設定
    if (validFrameCount === 0) {
      validFrameCount = 1; // ゼロ除算を防ぐ
      totalSpectralSlope = -10; // 中間的な値
      totalHighFrequencyRatio = 0.2;
      totalNoiseRatio = 0.5;
      totalNonIntegerHarmonics = 0.3;
    }
    
    // 平均値を計算
    const avgSpectralSlope = totalSpectralSlope / validFrameCount;
    const avgHighFrequencyRatio = totalHighFrequencyRatio / validFrameCount;
    const avgNoiseRatio = totalNoiseRatio / validFrameCount;
    const avgNonIntegerHarmonics = totalNonIntegerHarmonics / validFrameCount;
    
    // スペクトル傾斜による判定
    const isChestBySlope = avgSpectralSlope >= -10 && avgSpectralSlope <= -2;
    const isMiddleBySlope = avgSpectralSlope < -10 && avgSpectralSlope >= -13;
    const isFalsettoBySlope = avgSpectralSlope < -13;
    
    // 高周波成分の強度による判定
    const hasStrongHighFreq = avgHighFrequencyRatio >= 0.25;
    
    // 総合判定
    let voiceRegister: VoiceRegister = 'middle';
    if (isChestBySlope && hasStrongHighFreq) {
      // 両方の条件で地声傾向
      voiceRegister = 'chest';
    } else if (!hasStrongHighFreq) {
      // 高周波成分の強度で裏声傾向
      voiceRegister = 'falsetto';
    } else {
      // 高周波成分の強度で地声傾向かつスペクトル傾斜で裏声傾向または中間傾向
      voiceRegister = 'middle';
    }
    
    return {
      voiceRegister,
      parameters: {
        spectralSlope: avgSpectralSlope,
        highFrequencyRatio: avgHighFrequencyRatio,
        noiseRatio: avgNoiseRatio,
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
      noiseRatio: number;
      strength3kHz: number;
      strength4kHz: number;
      nonIntegerHarmonics: number;
    };
  } {
    // 複数フレームの平均値を計算
    let totalSpectralSlope = 0;
    let totalHighFrequencyRatio = 0;
    let totalNoiseRatio = 0;
    let totalStrength3kHz = 0;
    let totalStrength4kHz = 0;
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
      
      const highFrequencyRatio = this.calculateHighFrequencyRatio(freqData, sampleRate, pitch.frequency);
      const noiseRatio = this.estimateNoiseRatio(freqData, baseFrequency, sampleRate);
      
      // 3kHzと4kHz周辺の強度を分析
      const strength3kHz = this.analyzeFrequencyBandStrength(freqData, 2800, 3200, sampleRate);
      const strength4kHz = this.analyzeFrequencyBandStrength(freqData, 3800, 4200, sampleRate);
      const nonIntegerHarmonics = this.analyzeNonIntegerHarmonics(freqData, pitch.frequency, sampleRate);
      
      // 有効なフレームのみ集計
      if (!isNaN(harmonicResult.spectralSlope) && !isNaN(highFrequencyRatio) && !isNaN(noiseRatio)) {
        totalSpectralSlope += harmonicResult.spectralSlope;
        totalHighFrequencyRatio += highFrequencyRatio;
        totalNoiseRatio += noiseRatio;
        totalStrength3kHz += strength3kHz;
        totalStrength4kHz += strength4kHz;
        totalNonIntegerHarmonics += nonIntegerHarmonics;
        validFrameCount++;
      }
    }
    
    // 有効なフレームがない場合はデフォルト値を設定
    if (validFrameCount === 0) {
      validFrameCount = 1; // ゼロ除算を防ぐ
      totalSpectralSlope = -10; // 中間的な値
      totalHighFrequencyRatio = 0.2;
      totalNoiseRatio = 0.5;
      totalStrength3kHz = 0.3;
      totalStrength4kHz = 0.3;
      totalNonIntegerHarmonics = 0.3;
    }
    
    // 平均値を計算
    const avgSpectralSlope = totalSpectralSlope / validFrameCount;
    const avgHighFrequencyRatio = totalHighFrequencyRatio / validFrameCount;
    const avgNoiseRatio = totalNoiseRatio / validFrameCount;
    const avgStrength3kHz = totalStrength3kHz / validFrameCount;
    const avgStrength4kHz = totalStrength4kHz / validFrameCount;
    const avgNonIntegerHarmonics = totalNonIntegerHarmonics / validFrameCount;
    
    // スペクトル傾斜による判定
    const isChestBySlope = avgSpectralSlope >= -10 && avgSpectralSlope <= -2;
    const isMiddleBySlope = avgSpectralSlope < -10 && avgSpectralSlope >= -13;
    const isFalsettoBySlope = avgSpectralSlope < -13;
    
    // 高周波成分の強度による判定
    const hasStrongHighFreq = avgHighFrequencyRatio >= 0.25;
    
    // 総合判定
    let voiceRegister: VoiceRegister = 'middle';
    if (isChestBySlope && hasStrongHighFreq) {
      // 両方の条件で地声傾向
      voiceRegister = 'chest';
    } else if (!hasStrongHighFreq) {
      // 高周波成分の強度で裏声傾向
      voiceRegister = 'falsetto';
    } else {
      // 高周波成分の強度で地声傾向かつスペクトル傾斜で裏声傾向または中間傾向
      voiceRegister = 'middle';
    }
    
    return {
      voiceRegister,
      parameters: {
        spectralSlope: avgSpectralSlope,
        highFrequencyRatio: avgHighFrequencyRatio,
        noiseRatio: avgNoiseRatio,
        strength3kHz: avgStrength3kHz,
        strength4kHz: avgStrength4kHz,
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
      noiseRatio: number;
      strength3kHz?: number;
      nonIntegerHarmonics?: number;
    };
  } {
    // 複数フレームの平均値を計算
    let totalSpectralSlope = 0;
    let totalHighFrequencyRatio = 0;
    let totalNoiseRatio = 0;
    let totalStrength3kHz = 0;
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
      
      const highFrequencyRatio = this.calculateHighFrequencyRatio(freqData, sampleRate, pitch.frequency);
      const noiseRatio = this.estimateNoiseRatio(freqData, baseFrequency, sampleRate);
      const nonIntegerHarmonics = this.analyzeNonIntegerHarmonics(freqData, pitch.frequency, sampleRate);
      
      // 3kHz周辺の強度を分析
      const strength3kHz = this.analyzeFrequencyBandStrength(freqData, 2800, 3200, sampleRate);
      
      // 有効なフレームのみ集計
      if (!isNaN(harmonicResult.spectralSlope) && !isNaN(highFrequencyRatio) && !isNaN(noiseRatio)) {
        totalSpectralSlope += harmonicResult.spectralSlope;
        totalHighFrequencyRatio += highFrequencyRatio;
        totalNoiseRatio += noiseRatio;
        totalStrength3kHz += strength3kHz;
        validFrameCount++;
        totalNonIntegerHarmonics += nonIntegerHarmonics;
      }
    }
    
    // 有効なフレームがない場合はデフォルト値を設定
    if (validFrameCount === 0) {
      validFrameCount = 1; // ゼロ除算を防ぐ
      totalSpectralSlope = -10; // 中間的な値
      totalHighFrequencyRatio = 0.2;
      totalNoiseRatio = 0.5;
      totalStrength3kHz = 0.3;
      totalNonIntegerHarmonics = 0.3;
    }
    
    // 平均値を計算
    const avgSpectralSlope = totalSpectralSlope / validFrameCount;
    const avgHighFrequencyRatio = totalHighFrequencyRatio / validFrameCount;
    const avgNoiseRatio = totalNoiseRatio / validFrameCount;
    const avgStrength3kHz = totalStrength3kHz / validFrameCount;
    const avgNonIntegerHarmonics = totalNonIntegerHarmonics / validFrameCount;

    // スペクトル傾斜による判定
    const isChestBySlope = avgSpectralSlope >= -10 && avgSpectralSlope <= -2;
    const isMiddleBySlope = avgSpectralSlope < -10 && avgSpectralSlope >= -13;
    const isFalsettoBySlope = avgSpectralSlope < -13;
    
    // 高周波成分の強度による判定
    const hasStrongHighFreq = avgHighFrequencyRatio >= 0.25;
    
    // 総合判定
    let voiceRegister: VoiceRegister = 'middle';
    if (isChestBySlope && hasStrongHighFreq) {
      // 両方の条件で地声傾向
      voiceRegister = 'chest';
    } else if (!hasStrongHighFreq) {
      // 高周波成分の強度で裏声傾向
      voiceRegister = 'falsetto';
    } else {
      // 高周波成分の強度で地声傾向かつスペクトル傾斜で裏声傾向または中間傾向
      voiceRegister = 'middle';
    }
    
    return {
      voiceRegister,
      parameters: {
        spectralSlope: avgSpectralSlope,
        highFrequencyRatio: avgHighFrequencyRatio,
        noiseRatio: avgNoiseRatio,
        strength3kHz: avgStrength3kHz,
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
    pitchDataArrays: Record<string, number[]>,
    timestampsArrays: Record<string, number[]>,
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
          noiseRatio: 0
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
        noiseRatio: number;
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
        noiseRatio: lowPitchAnalysis.parameters.noiseRatio
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
        noiseRatio: midPitchAnalysis.parameters.noiseRatio
      },
      voiceRegister: midPitchAnalysis.voiceRegister
    };
    
    // 3kHzと4kHz周辺の強度を取得
    const avgStrength3kHz = midPitchAnalysis.parameters.strength3kHz || 0;
    const avgStrength4kHz = midPitchAnalysis.parameters.strength4kHz || 0;
    const avgNonIntegerHarmonics = midPitchAnalysis.parameters.nonIntegerHarmonics || 0;
    
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
        noiseRatio: highPitchAnalysis.parameters.noiseRatio,
      },
      voiceRegister: highPitchAnalysis.voiceRegister
    };
    
    // 音程間の声質変化を分析
    const voiceQualityChange = this.analyzeVoiceQualityChange(pitchResults, gender);
    const voiceConsistency = this.analyzeVoiceConsistency(pitchResults);
    const brightness3kHz = this.analyzeBrightness3kHz(pitchResults);
    const pitchAccuracy = this.analyzePitchAccuracy(pitchResults, gender);
    
    // パラメータの平均値を計算
    const avgParameters = this.calculateAverageParameters(pitchResults);
    
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
      console.log('Avg Strength 3kHz:', avgStrength3kHz);
      console.log('Avg Strength 4kHz:', avgStrength4kHz);
      console.log('Avg Non-Integer Harmonics:', avgNonIntegerHarmonics);
    // 1. 第1音程が中間または裏声の場合 → ライトチェスト
    if (lowVoiceRegister === 'middle' || lowVoiceRegister === 'falsetto') {
      finalVoiceType = 'lightChest';
      confidence = 0.8;
    }
    // 2. 第2音程の4kHz周辺の成分が強く、非整数次倍音が多い場合 → プル
    else if (lowVoiceRegister === 'chest') {
      // 3. 第2音程が中間または裏声の場合 → フリップ
      if ((midVoiceRegister === 'middle' || midVoiceRegister === 'falsetto')) {
        finalVoiceType = 'flip';
        confidence = 0.8;
      }
      else if (midVoiceRegister === 'chest') {
        if (avgNonIntegerHarmonics > 0.4) {
          finalVoiceType = 'pull';
          confidence = 0.8;
        }
        else {
          if (highVoiceRegister === 'chest' || highVoiceRegister === 'middle') {
            finalVoiceType = 'mixed';
            confidence = 0.8;
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
        ...avgParameters,
        voiceQualityChange,
        pitchAccuracy,
        voiceConsistency,
        brightness3kHz
      },
      pitchResults
    };
  }
  
  /**
   * 音程のパラメータを計算して結果に保存する
   * @param pitchResults 結果を保存するオブジェクト
   * @param pitch 音程情報
   * @param frequencyData 周波数データ
   * @param sampleRate サンプリングレート
   */
  // 不要なメソッドを削除

  /**
   * 音声タイプを分析するメソッド（単一音程）
   * @param frequencyDataArray 周波数データの配列
   * @param pitchDataArray ピッチデータの配列
   * @param timestamps タイムスタンプの配列
   * @param sampleRate サンプリングレート
   * @param targetFrequency 分析対象の音高の周波数（デフォルトはA4の440Hz）
   * @returns 音声タイプ分析結果
   */
  // 不要なメソッドを削除

  /**
   * 音程間の声質変化を分析する（フリップの特徴）
   * @param pitchResults 各音程の分析結果
   * @param gender 性別
   * @returns 声質変化の度合い（0-1）
   */
  analyzeVoiceQualityChange(
    pitchResults: Record<string, {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
    }>,
    gender: 'male' | 'female'
  ): number {
    const pitchSet = this.genderPitchSets[gender];
    
    // 低音と高音の倍音構造の差を計算
    const lowPitch = pitchSet[0];
    const highPitch = pitchSet[2];
    
    const lowPitchResult = pitchResults[lowPitch.id];
    const highPitchResult = pitchResults[highPitch.id];
    
    if (!lowPitchResult || !highPitchResult) {
      return 0;
    }
    
    // スペクトル傾斜と高周波数比率の差を計算
    const spectralSlopeDiff = Math.abs(
      lowPitchResult.parameters.spectralSlope - highPitchResult.parameters.spectralSlope
    );
    
    const highFreqDiff = Math.abs(
      lowPitchResult.parameters.highFrequencyRatio - highPitchResult.parameters.highFrequencyRatio
    );
    
    // 声質変化の度合いを計算（0-1）
    const voiceQualityChange = (spectralSlopeDiff * 2 + highFreqDiff) / 2;
    
    return Math.min(1, voiceQualityChange);
  }

  /**
   * 音程精度を分析する（プルはフラット傾向）
   * @param pitchResults 各音程の分析結果
   * @param gender 性別
   * @returns 音程精度（0-1、1が最も正確）
   */
  analyzePitchAccuracy(
    pitchResults: Record<string, {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
    }>,
    gender: 'male' | 'female'
  ): number {
    // 実装は省略（実際には検出されたピッチと目標ピッチの差を計算）
    // 現在のデータでは正確な音程精度を計算するのは難しいため、
    // 仮の値として0.8（やや正確）を返す
    return 0.8;
  }

  /**
   * 声質の一貫性を分析する（ミックスは一貫性が高い）
   * @param pitchResults 各音程の分析結果
   * @returns 声質の一貫性（0-1）
   */
  analyzeVoiceConsistency(
    pitchResults: Record<string, {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
    }>
  ): number {
    // 各パラメータの標準偏差を計算
    const spectralSlopeValues = Object.values(pitchResults).map(r => r.parameters.spectralSlope * 100); // スケーリングして計算
    const highFreqValues = Object.values(pitchResults).map(r => r.parameters.highFrequencyRatio * 100);
    
    const spectralSlopeStdDev = this.calculateStandardDeviation(spectralSlopeValues);
    const highFreqStdDev = this.calculateStandardDeviation(highFreqValues);
    
    // 標準偏差が小さいほど一貫性が高い
    const maxStdDev = 30; // 最大想定標準偏差
    const avgStdDev = (spectralSlopeStdDev + highFreqStdDev) / 2;
    
    // 一貫性を計算（0-1）
    const consistency = 1 - Math.min(1, avgStdDev / maxStdDev);
    
    return consistency;
  }

  /**
   * 3kHz周辺の強さを分析する（ミックスは3kHz周辺が強い）
   * @param pitchResults 各音程の分析結果
   * @returns 3kHz周辺の強さ（0-1）
   */
  analyzeBrightness3kHz(
    pitchResults: Record<string, {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
    }>
  ): number {
    // 高周波数帯域のエネルギー比率の平均を計算
    const highFreqRatios = Object.values(pitchResults).map(r => r.parameters.highFrequencyRatio);
    const avgHighFreqRatio = highFreqRatios.reduce((sum, val) => sum + val, 0) / highFreqRatios.length;
    
    // 3kHz周辺の強さを推定（0-1）
    // 現在のデータでは3kHz周辺のみを正確に分離できないため、
    // 高周波数帯域全体のエネルギー比率から推定
    const brightness3kHz = Math.min(1, avgHighFreqRatio * 3);
    
    return brightness3kHz;
  }

  /**
   * 標準偏差を計算する
   * @param values 値の配列
   * @returns 標準偏差
   */
  calculateStandardDeviation(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    
    return Math.sqrt(variance);
  }

  /**
   * 各音程の分析結果からパラメータの平均値を計算する
   * @param pitchResults 各音程の分析結果
   * @returns パラメータの平均値
   */
  calculateAverageParameters(
    pitchResults: Record<string, {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
    }>
  ): {
    spectralSlope: number;
    highFrequencyRatio: number;
    noiseRatio: number;
  } {
    const results = Object.values(pitchResults);
    
    return {
      spectralSlope: this.getAverageParameter(pitchResults, 'spectralSlope'),
      highFrequencyRatio: this.getAverageParameter(pitchResults, 'highFrequencyRatio'),
      noiseRatio: this.getAverageParameter(pitchResults, 'noiseRatio')
    };
  }

  /**
   * 特定のパラメータの平均値を取得する
   * @param pitchResults 各音程の分析結果
   * @param paramName パラメータ名
   * @returns パラメータの平均値
   */
  /**
   * 特定のパラメータの平均値を取得する
   * @param pitchResults 各音程の分析結果
   * @param paramName パラメータ名
   * @returns パラメータの平均値
   */
  getAverageParameter(
    pitchResults: Record<string, {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
    }>,
    paramName: 'spectralSlope' | 'highFrequencyRatio' | 'noiseRatio'
  ): number {
    const values = Object.values(pitchResults).map(r => r.parameters[paramName]);
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * スペクトル傾斜のスコアを計算する
   * @param pitchResults 各音程の分析結果
   * @param minSlope 最小スペクトル傾斜（dB/oct）
   * @param maxSlope 最大スペクトル傾斜（dB/oct）
   * @returns スコア（0-1）
   */
  calculateSpectralSlopeScore(
    pitchResults: Record<string, {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
    }>,
    minSlope: number,
    maxSlope: number
  ): number {
    // 平均スペクトル傾斜を取得
    const avgSlope = this.getAverageParameter(pitchResults, 'spectralSlope');
    
    // スペクトル傾斜が範囲内にあるかどうかを判定
    if (avgSlope >= minSlope && avgSlope <= maxSlope) {
      // 範囲内の場合、中心からの距離に基づいてスコアを計算
      const center = (minSlope + maxSlope) / 2;
      const distance = Math.abs(avgSlope - center);
      const maxDistance = (maxSlope - minSlope) / 2;
      
      // 中心に近いほどスコアが高い（1に近い）
      return 1 - (distance / maxDistance);
    } else {
      // 範囲外の場合、範囲の端からの距離に基づいてスコアを減少
      const closestBound = avgSlope < minSlope ? minSlope : maxSlope;
      const distance = Math.abs(avgSlope - closestBound);
      
      // 距離が大きいほどスコアが低い（0に近い）
      return Math.max(0, 1 - (distance / 5)); // 5 dB/octを超える距離でスコアは0になる
    }
  }

  /**
   * 高周波数帯域のエネルギー比率を計算する
   * @param frequencyData 周波数データ
   * @param sampleRate サンプリングレート
   * @returns 高周波数帯域のエネルギー比率
   */
  calculateHighFrequencyRatio(frequencyData: Uint8Array, sampleRate: number, targetFrequency?: number): number {
    const fftSize = frequencyData.length * 2;
    
    // 2kHz以上の周波数帯域のインデックスを計算
    const highFreqStartIdx = Math.floor((2000 / sampleRate) * fftSize);
    
    // 基音成分のインデックスと振幅を推定
    let baseAmp = 0;
    let baseIdx = 0;
    
    if (targetFrequency) {
      // 決められた基音から±5%以内の周波数のうち、最も大きい振幅を持つ成分を基音成分とする
      const rangePercent = 0.05; // 5%
      const minFrequency = targetFrequency * (1 - rangePercent);
      const maxFrequency = targetFrequency * (1 + rangePercent);
      
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
      // targetFrequencyが指定されていない場合は、低周波数帯域で最も強い成分を基音と見なす
      const lowFreqStartIdx = Math.floor((100 / sampleRate) * fftSize);
      const lowFreqEndIdx = Math.floor((1000 / sampleRate) * fftSize);
      
      for (let i = lowFreqStartIdx; i <= lowFreqEndIdx; i++) {
        if (i < frequencyData.length && frequencyData[i] > baseAmp) {
          baseAmp = frequencyData[i];
          baseIdx = i;
        }
      }
    }
    
    // 基音の振幅が0の場合は0を返す
    if (baseAmp === 0) return 0;
    
    // 2kHz以上の周波数帯域で最も強い成分を見つける
    let maxHighFreqAmp = 0;
    
    for (let i = highFreqStartIdx; i < frequencyData.length; i++) {
      if (frequencyData[i] > maxHighFreqAmp) {
        maxHighFreqAmp = frequencyData[i];
      }
    }
    
    // 2kHz以上の最大振幅成分の、基音成分に対する振幅比を計算
    return maxHighFreqAmp / baseAmp;
  }

  /**
   * ノイズ成分の割合を推定する
   * @param frequencyData 周波数データ
   * @param baseFrequency 基本周波数
   * @param sampleRate サンプリングレート
   * @returns ノイズ成分の割合
   */
  estimateNoiseRatio(
    frequencyData: Uint8Array,
    baseFrequency: number,
    sampleRate: number
  ): number {
    const fftSize = frequencyData.length * 2;
    
    // 倍音成分のインデックスを計算
    const harmonicIndices: number[] = [];
    const harmonicWidth = Math.max(2, Math.floor(baseFrequency / 50)); // 倍音の幅（周波数が高いほど広く）
    
    // 基本周波数と最大10倍までの倍音のインデックスを計算
    for (let i = 1; i <= 10; i++) {
      const harmonicFreq = baseFrequency * i;
      const harmonicIdx = Math.floor((harmonicFreq / sampleRate) * fftSize);
      
      // 倍音の周辺も含める
      for (let j = -harmonicWidth; j <= harmonicWidth; j++) {
        const idx = harmonicIdx + j;
        if (idx >= 0 && idx < frequencyData.length) {
          harmonicIndices.push(idx);
        }
      }
    }
    
    // 全体のエネルギーを計算
    let totalEnergy = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      totalEnergy += frequencyData[i] * frequencyData[i];
    }
    
    // 倍音成分のエネルギーを計算
    let harmonicEnergy = 0;
    for (const idx of harmonicIndices) {
      harmonicEnergy += frequencyData[idx] * frequencyData[idx];
    }
    
    // エネルギーが0の場合は1を返す（全てノイズと見なす）
    if (totalEnergy === 0) return 1;
    
    // ノイズ成分の割合を計算（1 - 倍音成分の割合）
    return 1 - (harmonicEnergy / totalEnergy);
  }

  /**
   * 分析結果を集計する
   * @param segmentResults セグメント毎の分析結果
   * @returns 全体の分析結果
   */
  // 不要なメソッドを削除

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
    
    // 基音の振幅が0の場合は0を返す（ゼロ除算を防ぐ）
    const baseAmp = baseIdx < frequencyData.length ? frequencyData[baseIdx] : 0;
    if (baseAmp === 0) {
      return {
        spectralSlope: 0,
        bandPeakRatio: 0,
        highFreqRatio: 0
      };
    }
    
    // スペクトル傾斜を計算（dB/oct単位）
    
    // 有効な周波数範囲を決定（ノイズを避けるため、基本周波数から上限までを考慮）
    const slopeStartIdx = Math.max(1, baseIdx - 5); // 基本周波数の少し下から
    const slopeEndIdx = Math.min(frequencyData.length - 1, Math.round((baseFrequency * 10 / sampleRate) * fftSize)); // 基本周波数の10倍まで
    
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
    
    const bandPeakRatio = (maxAmp / baseAmp) * 100;
    
    // 2.5kHz～6kHzの周波数帯域の最大振幅を計算
    const highFreqStartIdx = Math.floor((2500 / sampleRate) * fftSize);
    const highFreqEndIdx = Math.ceil((6000 / sampleRate) * fftSize);
    
    let highFreqMaxAmp = 0;
    for (let i = highFreqStartIdx; i <= highFreqEndIdx; i++) {
      if (i >= 0 && i < frequencyData.length && frequencyData[i] > highFreqMaxAmp) {
        highFreqMaxAmp = frequencyData[i];
      }
    }
    
    const highFreqRatio = (highFreqMaxAmp / baseAmp) * 100;
    
    return {
      spectralSlope,
      bandPeakRatio,
      highFreqRatio
    };
  }
}