# ボイスタイプ分析機能の仕組みと課題

## 1. 概要

現在のボイスタイプ分析機能は、ユーザーの音声を分析し、4つのボイスタイプ（プル、ライトチェスト、フリップ、ミックス）のいずれかに分類するシステムです。特にフリップの検出率が異様に高いという問題が指摘されています。

## 2. ボイスタイプ分類の基本設計

### 2.1 分析対象の音程

- **男性**: E3, E4, A4
- **女性**: A3, A4, E5

### 2.2 ボイスタイプの定義

- **プル**: 音程がフラット傾向、2倍音・3倍音が強い、声量が大きい
- **ライトチェスト**: 基音成分が強い、声量が小さい、全音程で類似した倍音構造
- **フリップ**: 低音と高音で声質に著しい差、特定音程で声質の急激な変化
- **ミックス**: 全音程で声質が一貫、倍音成分が豊か、3kHz周辺が強い

## 3. 分析アルゴリズムの実装

### 3.1 分析プロセス

1. 各音程ごとに単一音程の分析を実行
2. 音程間の声質変化、音程精度、声質の一貫性、3kHz周辺の強さを分析
3. 総合的なボイスタイプを判定

### 3.2 単一音程の分析（`analyzeVoiceType`メソッド）

```typescript
// 各フレームを分析
for (let i = 0; i < frequencyDataArray.length; i++) {
  // 基音と倍音の強度測定
  const baseFrequency = this.findStrongestFrequencyComponent(...);
  const harmonic2Frequency = this.findStrongestFrequencyComponent(...);
  const harmonic3Frequency = this.findStrongestFrequencyComponent(...);
  
  // 倍音分析を実行
  const harmonicResult = this.analyzeHarmonicComponents(...);
  
  // 高周波数帯域のエネルギー比率を計算
  const highFrequencyRatio = this.calculateHighFrequencyRatio(...);
  
  // ノイズ成分の割合を推定
  const noiseRatio = this.estimateNoiseRatio(...);
  
  // ボイスタイプを判定
  const { voiceType, confidence } = this.determineVoiceTypeForSinglePitch(...);
}
```

### 3.3 単一音程のボイスタイプ判定（`determineVoiceTypeForSinglePitch`メソッド）

```typescript
// スペクトル傾斜（dB/oct）は値が大きい（-6に近い）ほど地声（ライトチェスト）寄り、小さい（-18に近い）ほど裏声（プル）寄り
const spectralSlopeNormalized = (harmonicResult.spectralSlope + 18) / 12; // -18～-6を0～1に正規化
const spectralSlopeScore = Math.min(1, Math.max(0, spectralSlopeNormalized));
const highFreqScore = highFrequencyRatio >= 0.3 ? 1 : highFrequencyRatio / 0.3;
const noiseScore = noiseRatio <= 0.2 ? 1 : 1 - ((noiseRatio - 0.2) / 0.8);

// プルボイスの条件スコア
const pullScore = ((1 - spectralSlopeScore) + highFreqScore + (1 - noiseScore)) / 3;

// ライトチェストの条件スコア
const lightChestScore = (spectralSlopeScore + (1 - highFreqScore) + noiseScore) / 3;

// フリップの条件スコア
const flipScore = Math.abs(spectralSlopeScore - 0.5) * Math.abs(highFreqScore - 0.5) * 2;
```

### 3.4 複数音程の総合判定（`determineOverallVoiceType`メソッド）

```typescript
// プルのスコア
const pullScore = (
  this.calculateSpectralSlopeScore(pitchResults, -18, -13) * 2 +  // スペクトル傾斜が-13～-18 dB/octほど高スコア
  (1 - pitchAccuracy) * 2 +  // フラット傾向が強いほど高スコア
  Math.min(voiceConsistency * 0.5, 0.5)  // 一貫性は中程度が理想
) / 4;

// ライトチェストのスコア
const lightChestScore = (
  this.calculateSpectralSlopeScore(pitchResults, -10, -6) * 2 +  // スペクトル傾斜が-6～-10 dB/octほど高スコア
  (1 - this.getAverageParameter(pitchResults, 'highFrequencyRatio')) +
  Math.min(voiceConsistency * 0.7, 0.7)  // 一貫性はやや高め
) / 3;

// フリップのスコア
const flipScore = (
  voiceQualityChange * 2 +  // 声質変化が大きいほど高スコア
  (1 - voiceConsistency) * 2  // 一貫性が低いほど高スコア
) / 2;

// ミックスのスコア
const mixedScore = (
  this.calculateSpectralSlopeScore(pitchResults, -13, -10) * 2 +  // スペクトル傾斜が-10～-13 dB/octほど高スコア
  voiceConsistency * 2 +  // 一貫性が高いほど高スコア
  brightness3kHz * 2 +  // 3kHz周辺が強いほど高スコア
  pitchAccuracy  // 音程精度が高いほど高スコア
) / 5;
```

### 3.5 声質変化の分析（`analyzeVoiceQualityChange`メソッド）

```typescript
// 低音と高音の倍音構造の差を計算
const lowPitch = pitchSet[0];
const highPitch = pitchSet[2];

const lowPitchResult = pitchResults[lowPitch.id];
const highPitchResult = pitchResults[highPitch.id];

// スペクトル傾斜と高周波数比率の差を計算
const spectralSlopeDiff = Math.abs(
  lowPitchResult.parameters.spectralSlope - highPitchResult.parameters.spectralSlope
);

const highFreqDiff = Math.abs(
  lowPitchResult.parameters.highFrequencyRatio - highPitchResult.parameters.highFrequencyRatio
);

// 声質変化の度合いを計算（0-1）
const voiceQualityChange = (spectralSlopeDiff * 2 + highFreqDiff) / 2;
```

## 4. フリップ検出率が高い原因分析

### 4.1 単一音程の分析における問題点

フリップスコアの計算式に問題があります：

```typescript
const flipScore = Math.abs(spectralSlopeScore - 0.5) * Math.abs(highFreqScore - 0.5) * 2;
```

この式では、スペクトル傾斜スコアと高周波数スコアが中間値（0.5）から離れているほどフリップスコアが高くなります。つまり、「中間的な値ではない」という特徴だけでフリップと判定されやすくなっています。

### 4.2 複数音程の分析における問題点

1. **声質変化の計算に重み付けが偏っている**:
   ```typescript
   const voiceQualityChange = (spectralSlopeDiff * 2 + highFreqDiff) / 2;
   ```
   スペクトル傾斜の差に2倍の重みをつけているため、わずかな差でも声質変化が大きいと判定されやすい。

2. **音程精度の実装が不完全**:
   ```typescript
   analyzePitchAccuracy(): number {
     // 実装は省略（実際には検出されたピッチと目標ピッチの差を計算）
     // 現在のデータでは正確な音程精度を計算するのは難しいため、
     // 仮の値として0.8（やや正確）を返す
     return 0.8;
   }
   ```
   音程精度が常に固定値（0.8）を返しているため、プルの判定に影響している可能性があります。

3. **フリップスコアの計算が単純すぎる**:
   ```typescript
   const flipScore = (
     voiceQualityChange * 2 +  // 声質変化が大きいほど高スコア
     (1 - voiceConsistency) * 2  // 一貫性が低いほど高スコア
   ) / 2;
   ```
   声質変化と一貫性の低さだけでフリップと判定されるため、他のボイスタイプの特徴を持っていても、これらの値が高いとフリップと判定されやすい。

## 5. 改善提案

1. **フリップ判定の精緻化**:
   - 単一音程でのフリップ判定式を見直し、中間値からの乖離だけでなく、フリップ特有のパターンを検出する
   - 声質の急激な変化（ヨーデル的特徴）を検出するアルゴリズムを追加

2. **声質変化の計算バランス調整**:
   - スペクトル傾斜の差に対する重み付けを調整
   - 他のパラメータ（例：ノイズ比率の変化）も考慮

3. **音程精度の実装完成**:
   - 実際の音程と目標音程の差を計算する実装を完成させる
   - プルの特徴であるフラット傾向を正確に検出

4. **閾値の調整**:
   - 各ボイスタイプの判定閾値を実データに基づいて調整
   - 特にフリップの判定閾値を厳しくする

5. **テストデータによる検証**:
   - 各ボイスタイプの典型的な音声サンプルを用いて判定精度を検証
   - 誤判定が多いパターンを特定し、アルゴリズムを調整

これらの改善により、フリップの過剰検出を抑制し、より正確なボイスタイプ分類が可能になると考えられます。