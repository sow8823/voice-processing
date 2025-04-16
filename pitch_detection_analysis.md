# pitch-detection_cratesライブラリの解析と修正案

## 問題の概要
pitch-detection_cratesライブラリを使用した声のピッチ検出において、本来のピッチの2倍音（オクターブ上の音）を基音と誤認識してしまう問題が発生しています。

## ライブラリの構造と動作原理

### 1. 検出器の種類
ライブラリには3種類のピッチ検出アルゴリズムが実装されています：

1. **AutocorrelationDetector**: 最も基本的な自己相関に基づくピッチ検出
2. **McLeodDetector**: 正規化された二乗差関数に基づくピッチ検出
3. **YINDetector**: YINアルゴリズムに基づくピッチ検出

### 2. ピッチ検出の流れ

すべての検出器は共通のインターフェース`PitchDetector`を実装しており、`get_pitch`メソッドを通じてピッチを検出します。検出の流れは以下の通りです：

1. 入力信号のパワーが閾値以上かチェック
2. 各アルゴリズム固有の方法で信号を処理（自己相関、正規化二乗差など）
3. `pitch_from_peaks`関数を使用してピークを検出し、ピッチを計算

### 3. 問題の原因

問題の核心は`pitch_from_peaks`関数にあります。この関数は`internals.rs`で定義されており、以下のように動作します：

```rust
pub fn pitch_from_peaks<T>(
    input: &[T],
    sample_rate: usize,
    clarity_threshold: T,
    correction: PeakCorrection,
) -> Option<Pitch<T>>
where
    T: Float,
{
    let sample_rate = T::from_usize(sample_rate).unwrap();
    let peaks = detect_peaks(input);

    choose_peak(peaks, clarity_threshold)
        .map(|peak| correct_peak(peak, input, correction))
        .map(|peak| Pitch {
            frequency: sample_rate / peak.0,
            clarity: peak.1 / input[0],
        })
}
```

この関数は：
1. `detect_peaks`で信号のピークを検出
2. `choose_peak`で閾値を超える最初のピークを選択
3. 選択されたピークからピッチを計算

**問題点**: この実装では、最初に見つかった閾値を超えるピークを選択するだけで、そのピークが基音（基本周波数）なのか倍音なのかを判断していません。特に自己相関ベースの手法では、倍音（特に2倍音）が強く現れることがあり、これが誤検出の原因となっています。

## 修正案

問題を解決するために、`pitch_from_peaks`関数を修正し、検出されたピッチの半分の周波数帯も調査するロジックを追加します。具体的には：

1. 最初に検出されたピークの周波数を計算
2. その周波数の半分（オクターブ下）の周波数帯を調査
3. もし半分の周波数帯にも一定の尤度を持つピークが存在する場合、そちらを優先

### 修正コード案

```rust
pub fn pitch_from_peaks<T>(
    input: &[T],
    sample_rate: usize,
    clarity_threshold: T,
    correction: PeakCorrection,
) -> Option<Pitch<T>>
where
    T: Float,
{
    let sample_rate = T::from_usize(sample_rate).unwrap();
    let peaks: Vec<(usize, T)> = detect_peaks(input).collect();
    
    // 最初のピークを選択
    let first_peak = choose_peak(peaks.iter().cloned(), clarity_threshold);
    
    if let Some(peak) = first_peak {
        let corrected_peak = correct_peak(peak, input, correction);
        let frequency = sample_rate / corrected_peak.0;
        let clarity = corrected_peak.1 / input[0];
        
        // 半分の周波数に対応するインデックスを計算（2倍の周期）
        let half_freq_idx = (corrected_peak.0 * T::from_f64(2.0).unwrap()).to_usize().unwrap_or(0);
        
        // 半分の周波数の周辺を調査（±10%の範囲）
        let lower_bound = (half_freq_idx as f64 * 0.9) as usize;
        let upper_bound = (half_freq_idx as f64 * 1.1) as usize;
        
        // 範囲内のピークを探す
        let half_freq_peaks: Vec<(usize, T)> = peaks.iter()
            .filter(|(idx, _)| *idx >= lower_bound && *idx <= upper_bound)
            .cloned()
            .collect();
        
        // 半分の周波数に十分な強度のピークがあるか確認
        if let Some(half_peak) = choose_peak(half_freq_peaks.into_iter(), clarity_threshold * T::from_f64(0.5).unwrap()) {
            let corrected_half_peak = correct_peak(half_peak, input, correction);
            let half_frequency = sample_rate / corrected_half_peak.0;
            let half_clarity = corrected_half_peak.1 / input[0];
            
            // 半分の周波数のピークの尤度が元のピークの尤度の一定割合以上なら、半分の周波数を採用
            if half_clarity >= clarity * T::from_f64(0.3).unwrap() {
                return Some(Pitch {
                    frequency: half_frequency,
                    clarity: half_clarity,
                });
            }
        }
        
        // 半分の周波数に十分な強度のピークがなければ、元のピークを採用
        return Some(Pitch {
            frequency,
            clarity,
        });
    }
    
    None
}
```

### 修正のポイント

1. **ピークの収集**: すべてのピークを一度ベクターに収集し、後で再利用できるようにします。
2. **半分の周波数の探索**: 検出されたピッチの半分の周波数（2倍の周期）に対応するインデックスを計算し、その周辺（±10%）を調査します。
3. **尤度の比較**: 半分の周波数のピークの尤度が元のピークの尤度の一定割合（例：30%）以上であれば、半分の周波数を採用します。
4. **パラメータ調整**: 閾値（0.5）や尤度比較の割合（0.3）は、実際の音声データでテストして最適な値に調整する必要があります。

## 期待される効果

この修正により、声のピッチ検出時に2倍音を基音と誤認識する問題が軽減されると期待されます。特に、基本周波数が弱く、倍音が強い音声（例：電話音声や特定の楽器音）に対して効果的です。

## 注意点

1. この修正は計算コストを若干増加させますが、ピッチ検出の精度向上のためには妥当なトレードオフと考えられます。
2. パラメータ（閾値や尤度比較の割合）は、実際の使用ケースに合わせて調整が必要です。
3. この修正は主に2倍音の誤認識に対処するものであり、他の倍音（3倍音など）に対しては追加の対策が必要かもしれません。