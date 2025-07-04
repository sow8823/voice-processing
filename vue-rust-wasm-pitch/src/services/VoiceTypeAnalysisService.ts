/**
 * ボイスタイプ分析を担当するサービス
 */
import type { HarmonicAnalysisResult } from './FrequencyAnalysisService';

export type VoiceType = 'lightChest' | 'pull' | 'mixed' | 'unknown';

export interface VoiceTypeAnalysisResult {
  voiceType: VoiceType;
  confidence: number; // 0-1の範囲で分類の確信度
  parameters: {
    harmonic2Ratio: number;
    harmonic3Ratio: number;
    highFrequencyRatio: number;
    noiseRatio: number;
    // その他の分析パラメータ
  };
  timeSegments?: {
    startTime: number;
    endTime: number;
    voiceType: VoiceType;
  }[];
}

export class VoiceTypeAnalysisService {
  // 音高と周波数のマッピング
  private noteFrequencyMap: Record<string, number> = {
    // A3 (57) から A5 (81) までの音高と周波数のマッピング
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

  /**
   * 音声タイプを分析するメソッド
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
        harmonic2Ratio: number;
        harmonic3Ratio: number;
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
      
      console.log(`選択音高: ${targetFrequency}Hz, 検出された基音成分: ${baseFrequency}Hz`);
      
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
      
      console.log(`第2倍音成分: ${harmonic2Frequency}Hz, 第3倍音成分: ${harmonic3Frequency}Hz`);
      
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

      // ボイスタイプを判定
      const { voiceType, confidence } = this.determineVoiceType(
        harmonicResult,
        highFrequencyRatio,
        noiseRatio
      );

      // 結果を格納
      segmentResults.push({
        voiceType,
        confidence,
        parameters: {
          harmonic2Ratio: harmonicResult.harmonic2Ratio,
          harmonic3Ratio: harmonicResult.harmonic3Ratio,
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
          harmonic2Ratio: 0,
          harmonic3Ratio: 0,
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
   * ボイスタイプを判定する
   * @param harmonicResult 倍音分析結果
   * @param highFrequencyRatio 高周波数帯域のエネルギー比率
   * @param noiseRatio ノイズ成分の割合
   * @returns ボイスタイプと確信度
   */
  determineVoiceType(
    harmonicResult: HarmonicAnalysisResult,
    highFrequencyRatio: number,
    noiseRatio: number
  ): { voiceType: VoiceType; confidence: number } {
    // 各パラメータのスコアを計算（0-1の範囲）
    const harmonic2Score = harmonicResult.harmonic2Ratio >= 70 ? 1 : harmonicResult.harmonic2Ratio / 70;
    const harmonic3Score = harmonicResult.harmonic3Ratio >= 50 ? 1 : harmonicResult.harmonic3Ratio / 50;
    const highFreqScore = highFrequencyRatio >= 0.3 ? 1 : highFrequencyRatio / 0.3;
    const noiseScore = noiseRatio <= 0.2 ? 1 : 1 - ((noiseRatio - 0.2) / 0.8);
    
    // プルボイスの条件スコア
    const pullScore = (harmonic2Score + harmonic3Score + highFreqScore + noiseScore) / 4;
    
    // ライトチェストの条件スコア
    const lightChestScore = (
      (1 - harmonic2Score) + 
      (1 - harmonic3Score) + 
      (1 - highFreqScore) + 
      (1 - noiseScore)
    ) / 4;
    
    // スコアに基づいてボイスタイプを判定
    if (pullScore > lightChestScore) {
      // プルボイスの確信度
      const confidence = Math.min(1, Math.max(0, (pullScore - lightChestScore) * 2));
      return { voiceType: 'pull', confidence };
    } else {
      // ライトチェストの確信度
      const confidence = Math.min(1, Math.max(0, (lightChestScore - pullScore) * 2));
      return { voiceType: 'lightChest', confidence };
    }
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
        harmonic2Ratio: number;
        harmonic3Ratio: number;
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
      mixed: 0,
      unknown: 0
    };
    
    // 各パラメータの合計値
    let totalHarmonic2Ratio = 0;
    let totalHarmonic3Ratio = 0;
    let totalHighFrequencyRatio = 0;
    let totalNoiseRatio = 0;
    let totalConfidence = 0;
    
    // 各セグメントの結果を集計
    for (const result of segmentResults) {
      typeCounts[result.voiceType]++;
      totalHarmonic2Ratio += result.parameters.harmonic2Ratio;
      totalHarmonic3Ratio += result.parameters.harmonic3Ratio;
      totalHighFrequencyRatio += result.parameters.highFrequencyRatio;
      totalNoiseRatio += result.parameters.noiseRatio;
      totalConfidence += result.confidence;
    }
    
    // 最も多いボイスタイプを特定
    let dominantType: VoiceType = 'unknown';
    let maxCount = 0;
    
    for (const type of ['lightChest', 'pull', 'mixed', 'unknown'] as VoiceType[]) {
      if (typeCounts[type] > maxCount) {
        maxCount = typeCounts[type];
        dominantType = type;
      }
    }
    
    // 平均値を計算
    const count = segmentResults.length;
    const avgHarmonic2Ratio = totalHarmonic2Ratio / count;
    const avgHarmonic3Ratio = totalHarmonic3Ratio / count;
    const avgHighFrequencyRatio = totalHighFrequencyRatio / count;
    const avgNoiseRatio = totalNoiseRatio / count;
    const avgConfidence = totalConfidence / count;
    
    // 全体の結果を返す
    return {
      voiceType: dominantType,
      confidence: avgConfidence,
      parameters: {
        harmonic2Ratio: avgHarmonic2Ratio,
        harmonic3Ratio: avgHarmonic3Ratio,
        highFrequencyRatio: avgHighFrequencyRatio,
        noiseRatio: avgNoiseRatio
      }
    };
  }

  /**
   * 時間セグメントを作成する
   * @param segmentResults セグメント毎の分析結果
   * @param timestamps タイムスタンプの配列
   * @returns 時間セグメントの配列
   */
  createTimeSegments(
    segmentResults: {
      voiceType: VoiceType;
      confidence: number;
      parameters: {
        harmonic2Ratio: number;
        harmonic3Ratio: number;
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
    
    // 各周波数のインデックスを計算
    const baseIdx = Math.round((baseFrequency / sampleRate) * fftSize);
    const harmonic2Idx = Math.round((harmonic2Frequency / sampleRate) * fftSize);
    const harmonic3Idx = Math.round((harmonic3Frequency / sampleRate) * fftSize);
    
    // 各周波数の振幅を取得
    const baseAmp = baseIdx < frequencyData.length ? frequencyData[baseIdx] : 1;
    const harmonic2Amp = harmonic2Idx < frequencyData.length ? frequencyData[harmonic2Idx] : 0;
    const harmonic3Amp = harmonic3Idx < frequencyData.length ? frequencyData[harmonic3Idx] : 0;
    
    // 比率を計算
    const harmonic2Ratio = (harmonic2Amp / baseAmp) * 100;
    const harmonic3Ratio = (harmonic3Amp / baseAmp) * 100;
    
    // 2.8kHz～3.2kHzの周波数帯域の最大振幅を計算
    const startIdx = Math.floor((2800 / sampleRate) * fftSize);
    const endIdx = Math.ceil((3200 / sampleRate) * fftSize);
    
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
}

// シングルトンインスタンスをエクスポート
export const voiceTypeAnalysisService = new VoiceTypeAnalysisService();