/**
 * ボイスタイプ分析を担当するサービス
 */
import type { HarmonicAnalysisResult } from './FrequencyAnalysisService';

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
  analyzeMultiplePitches(
    frequencyDataArrays: Record<string, Uint8Array[]>,
    pitchDataArrays: Record<string, number[]>,
    timestampsArrays: Record<string, number[]>,
    sampleRate: number,
    gender: 'male' | 'female'
  ): VoiceTypeAnalysisResult {
    // 各音程ごとの分析結果
    const pitchResults: Record<string, {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
    }> = {};

    // 使用する音程セット
    const pitchSet = this.genderPitchSets[gender];

    // 各音程ごとに分析
    for (const pitch of pitchSet) {
      const frequencyDataArray = frequencyDataArrays[pitch.id];
      const pitchDataArray = pitchDataArrays[pitch.id];
      const timestamps = timestampsArrays[pitch.id];

      if (!frequencyDataArray || !pitchDataArray || !timestamps) {
        console.warn(`${pitch.name}の分析データが不足しています`);
        continue;
      }

      // 単一音程の分析を実行
      const result = this.analyzeVoiceType(
        frequencyDataArray,
        pitchDataArray,
        timestamps,
        sampleRate,
        pitch.frequency
      );

      // 結果を保存
      pitchResults[pitch.id] = {
        voiceType: result.voiceType,
        confidence: result.confidence,
        parameters: result.parameters
      };
    }

    // 分析結果が不足している場合
    if (Object.keys(pitchResults).length < pitchSet.length) {
      return {
        voiceType: 'unknown',
        confidence: 0,
        parameters: {
          spectralSlope: 0,
          highFrequencyRatio: 0,
          noiseRatio: 0
        },
        pitchResults
      };
    }

    // 音程間の声質変化を分析
    const voiceQualityChange = this.analyzeVoiceQualityChange(pitchResults, gender);
    
    // 音程精度を分析（プルはフラット傾向）
    const pitchAccuracy = this.analyzePitchAccuracy(pitchResults, gender);
    
    // 声質の一貫性を分析（ミックスは一貫性が高い）
    const voiceConsistency = this.analyzeVoiceConsistency(pitchResults);
    
    // 3kHz周辺の強さを分析（ミックスは3kHz周辺が強い）
    const brightness3kHz = this.analyzeBrightness3kHz(pitchResults);

    // 総合的なボイスタイプ判定
    const { voiceType, confidence } = this.determineOverallVoiceType(
      pitchResults,
      voiceQualityChange,
      pitchAccuracy,
      voiceConsistency,
      brightness3kHz
    );

    // パラメータの平均値を計算
    const avgParameters = this.calculateAverageParameters(pitchResults);

    // 結果を返す
    return {
      voiceType,
      confidence,
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
   * 音声タイプを分析するメソッド（単一音程）
   * @param frequencyDataArray 周波数データの配列
   * @param pitchDataArray ピッチデータの配列
   * @param timestamps タイムスタンプの配列
   * @param sampleRate サンプリングレート
   * @param targetFrequency 分析対象の音高の周波数（デフォルトはA4の440Hz）
   * @returns 音声タイプ分析結果
   */
  analyzeVoiceType(
    frequencyDataArray: Uint8Array[],
    pitchDataArray: number[],
    timestamps: number[],
    sampleRate: number,
    targetFrequency: number = 440 // デフォルトはA4
  ): VoiceTypeAnalysisResult {
    // 分析結果を格納する配列
    const segmentResults: {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
      timestamp: number;
    }[] = [];

    // 各フレームを分析
    for (let i = 0; i < frequencyDataArray.length; i++) {
      const frequencyData = frequencyDataArray[i];
      const pitch = pitchDataArray[i];
      const timestamp = timestamps[i];

      // ピッチが検出されていない場合はスキップ
      if (!pitch || pitch < 50) {
        continue;
      }

      // 選択された音高の周辺（±5%）で最も強いスペクトル成分を見つける
      const baseFrequency = this.findStrongestFrequencyComponent(
        frequencyData,
        targetFrequency,
        sampleRate,
        0.05 // 5%の範囲
      );
      
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
      
      // 倍音分析を実行（検出された基音成分と倍音成分を使用）
      const harmonicResult = this.analyzeHarmonicComponents(
        frequencyData,
        baseFrequency,
        harmonic2Frequency,
        harmonic3Frequency,
        sampleRate
      );

      // 高周波数帯域のエネルギー比率を計算
      const highFrequencyRatio = this.calculateHighFrequencyRatio(frequencyData, sampleRate);

      // ノイズ成分の割合を推定
      const noiseRatio = this.estimateNoiseRatio(frequencyData, baseFrequency, sampleRate);

      // ボイスタイプを判定（単一音程の分析では、プル、ライトチェスト、フリップのみ判定可能）
      const { voiceType, confidence } = this.determineVoiceTypeForSinglePitch(
        harmonicResult,
        highFrequencyRatio,
        noiseRatio
      );

      // 結果を格納
      segmentResults.push({
        voiceType,
        confidence,
        parameters: {
          spectralSlope: harmonicResult.spectralSlope,
          highFrequencyRatio,
          noiseRatio
        },
        timestamp
      });
    }

    // 有効な分析結果がない場合
    if (segmentResults.length === 0) {
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

    // 全体の分析結果を集計
    const overallResult = this.aggregateResults(segmentResults);

    // 時間セグメントを作成
    const timeSegments = this.createTimeSegments(segmentResults);

    return {
      ...overallResult,
      timeSegments
    };
  }

  /**
   * 単一音程のボイスタイプを判定する（プル、ライトチェスト、フリップのみ）
   * @param harmonicResult 倍音分析結果
   * @param highFrequencyRatio 高周波数帯域のエネルギー比率
   * @param noiseRatio ノイズ成分の割合
   * @returns ボイスタイプと確信度
   */
  determineVoiceTypeForSinglePitch(
    harmonicResult: HarmonicAnalysisResult,
    highFrequencyRatio: number,
    noiseRatio: number
  ): { voiceType: VoiceType; confidence: number } {
    // 各パラメータのスコアを計算（0-1の範囲）
    // スペクトル傾斜は値が大きいほど傾斜が急（ライトチェスト寄り）、小さいほど傾斜がゆるやか（プル/ミックス寄り）
    const spectralSlopeScore = harmonicResult.spectralSlope >= 0.7 ? 1 : harmonicResult.spectralSlope / 0.7;
    const highFreqScore = highFrequencyRatio >= 0.3 ? 1 : highFrequencyRatio / 0.3;
    const noiseScore = noiseRatio <= 0.2 ? 1 : 1 - ((noiseRatio - 0.2) / 0.8);
    
    // プルボイスの条件スコア（スペクトル傾斜がゆるやか、高周波成分が多い）
    const pullScore = ((1 - spectralSlopeScore) + highFreqScore + (1 - noiseScore)) / 3;
    
    // ライトチェストの条件スコア（スペクトル傾斜が急、高周波成分が少ない）
    const lightChestScore = (spectralSlopeScore + (1 - highFreqScore) + noiseScore) / 3;

    // フリップの条件スコア（声質の不安定さを検出）
    // フリップは特定の音程で声質が急激に変化する特徴がある
    // 単一音程の分析では完全には判定できないが、特徴的なパターンを検出する
    const flipScore = Math.abs(spectralSlopeScore - 0.5) * Math.abs(highFreqScore - 0.5) * 2;
    
    // 最も高いスコアを持つボイスタイプを判定
    const scores = [
      { type: 'pull', score: pullScore },
      { type: 'lightChest', score: lightChestScore },
      { type: 'flip', score: flipScore }
    ];
    
    scores.sort((a, b) => b.score - a.score);
    
    const highestScore = scores[0];
    const secondHighestScore = scores[1];
    
    // 確信度を計算（最高スコアと次点のスコアの差に基づく）
    const confidence = Math.min(1, Math.max(0, (highestScore.score - secondHighestScore.score) * 2));
    
    return { 
      voiceType: highestScore.type as VoiceType, 
      confidence 
    };
  }

  /**
   * 複数音程の分析結果から総合的なボイスタイプを判定する
   * @param pitchResults 各音程の分析結果
   * @param voiceQualityChange 声質変化の度合い
   * @param pitchAccuracy 音程精度
   * @param voiceConsistency 声質の一貫性
   * @param brightness3kHz 3kHz周辺の強さ
   * @returns ボイスタイプと確信度
   */
  determineOverallVoiceType(
    pitchResults: Record<string, {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
    }>,
    voiceQualityChange: number,
    pitchAccuracy: number,
    voiceConsistency: number,
    brightness3kHz: number
  ): { voiceType: VoiceType; confidence: number } {
    // 各ボイスタイプのスコアを計算
    
    // プルのスコア（ゆるやかなスペクトル傾斜、フラット傾向、中程度の一貫性）
    const pullScore = (
      (1 - this.getAverageParameter(pitchResults, 'spectralSlope')) * 2 +  // スペクトル傾斜がゆるやかなほど高スコア
      (1 - pitchAccuracy) * 2 +  // フラット傾向が強いほど高スコア
      Math.min(voiceConsistency * 0.5, 0.5)  // 一貫性は中程度が理想
    ) / 4;
    
    // ライトチェストのスコア（急なスペクトル傾斜、低い高周波数比率）
    const lightChestScore = (
      this.getAverageParameter(pitchResults, 'spectralSlope') * 2 +  // スペクトル傾斜が急なほど高スコア
      (1 - this.getAverageParameter(pitchResults, 'highFrequencyRatio')) +
      Math.min(voiceConsistency * 0.7, 0.7)  // 一貫性はやや高め
    ) / 3;
    
    // フリップのスコア（声質変化が大きい、一貫性が低い）
    const flipScore = (
      voiceQualityChange * 2 +  // 声質変化が大きいほど高スコア
      (1 - voiceConsistency) * 2  // 一貫性が低いほど高スコア
    ) / 2;
    
    // ミックスのスコア（中程度のスペクトル傾斜、高い一貫性、高い3kHz周辺の強さ、良好な音程精度）
    const mixedScore = (
      (1 - Math.abs(this.getAverageParameter(pitchResults, 'spectralSlope') - 0.5)) * 2 +  // スペクトル傾斜が中程度が理想
      voiceConsistency * 2 +  // 一貫性が高いほど高スコア
      brightness3kHz * 2 +  // 3kHz周辺が強いほど高スコア
      pitchAccuracy  // 音程精度が高いほど高スコア
    ) / 5;
    
    // 最も高いスコアを持つボイスタイプを判定
    const scores = [
      { type: 'pull', score: pullScore },
      { type: 'lightChest', score: lightChestScore },
      { type: 'flip', score: flipScore },
      { type: 'mixed', score: mixedScore }
    ];
    
    scores.sort((a, b) => b.score - a.score);
    
    const highestScore = scores[0];
    const secondHighestScore = scores[1];
    
    // 確信度を計算（最高スコアと次点のスコアの差に基づく）
    const confidence = Math.min(1, Math.max(0, (highestScore.score - secondHighestScore.score) * 2));
    
    console.log('ボイスタイプ判定スコア:', scores);
    
    return { 
      voiceType: highestScore.type as VoiceType, 
      confidence 
    };
  }

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
   * 高周波数帯域のエネルギー比率を計算する
   * @param frequencyData 周波数データ
   * @param sampleRate サンプリングレート
   * @returns 高周波数帯域のエネルギー比率
   */
  calculateHighFrequencyRatio(frequencyData: Uint8Array, sampleRate: number): number {
    const fftSize = frequencyData.length * 2;
    
    // 3kHz以上の周波数帯域のインデックスを計算
    const highFreqStartIdx = Math.floor((3000 / sampleRate) * fftSize);
    
    // 全体のエネルギーを計算
    let totalEnergy = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      totalEnergy += frequencyData[i] * frequencyData[i]; // 二乗値でエネルギーを計算
    }
    
    // 高周波数帯域のエネルギーを計算
    let highFreqEnergy = 0;
    for (let i = highFreqStartIdx; i < frequencyData.length; i++) {
      highFreqEnergy += frequencyData[i] * frequencyData[i];
    }
    
    // エネルギーが0の場合は0を返す
    if (totalEnergy === 0) return 0;
    
    // 高周波数帯域のエネルギー比率を計算
    return highFreqEnergy / totalEnergy;
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
  aggregateResults(
    segmentResults: {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
      timestamp: number;
    }[]
  ): Omit<VoiceTypeAnalysisResult, 'timeSegments'> {
    // 各ボイスタイプの数をカウント
    const typeCounts: Record<VoiceType, number> = {
      lightChest: 0,
      pull: 0,
      flip: 0,
      mixed: 0,
      unknown: 0
    };
    
    // 各パラメータの合計値
    let totalSpectralSlope = 0;
    let totalHighFrequencyRatio = 0;
    let totalNoiseRatio = 0;
    let totalConfidence = 0;
    
    // 各セグメントの結果を集計
    for (const result of segmentResults) {
      typeCounts[result.voiceType]++;
      totalSpectralSlope += result.parameters.spectralSlope;
      totalHighFrequencyRatio += result.parameters.highFrequencyRatio;
      totalNoiseRatio += result.parameters.noiseRatio;
      totalConfidence += result.confidence;
    }
    
    // 最も多いボイスタイプを特定
    let dominantType: VoiceType = 'unknown';
    let maxCount = 0;
    
    for (const type of ['lightChest', 'pull', 'flip', 'mixed', 'unknown'] as VoiceType[]) {
      if (typeCounts[type] > maxCount) {
        maxCount = typeCounts[type];
        dominantType = type;
      }
    }
    
    // 平均値を計算
    const count = segmentResults.length;
    const avgSpectralSlope = totalSpectralSlope / count;
    const avgHighFrequencyRatio = totalHighFrequencyRatio / count;
    const avgNoiseRatio = totalNoiseRatio / count;
    const avgConfidence = totalConfidence / count;
    
    // 全体の結果を返す
    return {
      voiceType: dominantType,
      confidence: avgConfidence,
      parameters: {
        spectralSlope: avgSpectralSlope,
        highFrequencyRatio: avgHighFrequencyRatio,
        noiseRatio: avgNoiseRatio
      }
    };
  }

  /**
   * 時間セグメントを作成する
   * @param segmentResults セグメント毎の分析結果
   * @returns 時間セグメントの配列
   */
  createTimeSegments(
    segmentResults: {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        spectralSlope: number;
        highFrequencyRatio: number;
        noiseRatio: number;
      };
      timestamp: number;
    }[]
  ): { startTime: number; endTime: number; voiceType: VoiceType }[] {
    if (segmentResults.length === 0) return [];
    
    const segments: { startTime: number; endTime: number; voiceType: VoiceType }[] = [];
    let currentType = segmentResults[0].voiceType;
    let startTime = segmentResults[0].timestamp;
    let lastTime = startTime;
    
    // 連続する同じボイスタイプをセグメント化
    for (let i = 1; i < segmentResults.length; i++) {
      const result = segmentResults[i];
      
      // ボイスタイプが変わった場合、セグメントを確定
      if (result.voiceType !== currentType) {
        segments.push({
          startTime,
          endTime: lastTime,
          voiceType: currentType
        });
        
        // 新しいセグメントを開始
        currentType = result.voiceType;
        startTime = result.timestamp;
      }
      
      lastTime = result.timestamp;
    }
    
    // 最後のセグメントを追加
    segments.push({
      startTime,
      endTime: lastTime,
      voiceType: currentType
    });
    
    return segments;
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
    harmonic2Frequency: number,
    harmonic3Frequency: number,
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
        bandPeakRatio: 0
      };
    }
    
    // スペクトル傾斜を計算（Spectral Slope = ∑(fi - f̄)² / ∑(fi - f̄)(Ai - Ā)）
    
    // 有効な周波数範囲を決定（ノイズを避けるため、基本周波数から上限までを考慮）
    const slopeStartIdx = Math.max(1, baseIdx - 5); // 基本周波数の少し下から
    const slopeEndIdx = Math.min(frequencyData.length - 1, Math.round((baseFrequency * 10 / sampleRate) * fftSize)); // 基本周波数の10倍まで
    
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
    
    return {
      spectralSlope,
      bandPeakRatio
    };
  }
}