# ピッチ検出ライブラリの修正実装ドキュメント

## 修正の概要

pitch-detection_cratesライブラリにおいて、声のピッチ検出時に本来のピッチの2倍音（オクターブ上の音）を基音と誤認識してしまう問題を修正しました。

## 修正内容

### 1. `pitch_from_peaks`関数の修正

`src/detector/internals.rs`ファイルの`pitch_from_peaks`関数を修正し、検出されたピッチの半分の周波数帯も調査するロジックを追加しました。

修正前のコード:
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

修正後のコード:
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
    // すべてのピークを収集して後で再利用できるようにする
    let peaks: Vec<(usize, T)> = detect_peaks(input).collect();
    
    // 最初のピークを選択
    let first_peak = choose_peak(peaks.iter().cloned(), clarity_threshold);
    
    if let Some(peak) = first_peak {
        let corrected_peak = correct_peak(peak, input, correction);
        let frequency = sample_rate / corrected_peak.0;
        let clarity = corrected_peak.1 / input[0];
        
        // 半分の周波数に対応するインデックスを計算（2倍の周期）
        // インデックスは周期に対応するため、2倍の周期は2倍のインデックス
        let half_freq_idx = (corrected_peak.0 * T::from_f64(2.0).unwrap()).to_usize().unwrap_or(usize::MAX);
        
        // インデックスが有効範囲内かチェック
        if half_freq_idx < input.len() {
            // 半分の周波数の周辺を調査（±10%の範囲）
            let lower_bound = (half_freq_idx as f64 * 0.9) as usize;
            let upper_bound = (half_freq_idx as f64 * 1.1) as usize;
            let upper_bound = upper_bound.min(input.len() - 1);
            
            // 範囲内のピークを探す
            let half_freq_peaks: Vec<(usize, T)> = peaks.iter()
                .filter(|(idx, _)| *idx >= lower_bound && *idx <= upper_bound)
                .cloned()
                .collect();
            
            // 半分の周波数に十分な強度のピークがあるか確認
            // 閾値を少し下げて検出しやすくする
            let half_threshold = clarity_threshold * T::from_f64(0.5).unwrap();
            if let Some(half_peak) = choose_peak(half_freq_peaks.into_iter(), half_threshold) {
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

### 2. テストの追加

修正の効果を検証するために、`tests/octave_test.rs`ファイルを作成し、以下のテストを追加しました：

1. **合成信号テスト**: 基本周波数（220Hz）と2倍音（440Hz）を含む合成信号を生成し、修正後のアルゴリズムが正しく基本周波数を検出できることを確認するテスト。
2. **実音声テスト**: 実際の音声ファイル（テナートロンボーンのC3音）を使用して、修正後のアルゴリズムが正しく基本周波数を検出できることを確認するテスト。

## 修正のポイント

1. **ピークの収集**: すべてのピークを一度ベクターに収集し、後で再利用できるようにしました。
2. **半分の周波数の探索**: 検出されたピッチの半分の周波数（2倍の周期）に対応するインデックスを計算し、その周辺（±10%）を調査します。
3. **尤度の比較**: 半分の周波数のピークの尤度が元のピークの尤度の一定割合（30%）以上であれば、半分の周波数を採用します。
4. **パラメータ調整**: 閾値（0.5）や尤度比較の割合（0.3）は、実際の音声データでテストして最適な値に調整しました。

## 期待される効果

この修正により、声のピッチ検出時に2倍音を基音と誤認識する問題が軽減されます。特に、基本周波数が弱く、倍音が強い音声（例：電話音声や特定の楽器音）に対して効果的です。

## テスト方法

修正の効果を確認するには、以下のコマンドでテストを実行します：

```bash
cd pitch-detection_crates
cargo test --test octave_test
```

テストでは、基本周波数と2倍音を含む合成信号を使用して、修正前は2倍音を検出していたところが、修正後は正しく基本周波数を検出できることを確認します。

## 注意点

1. この修正は計算コストを若干増加させますが、ピッチ検出の精度向上のためには妥当なトレードオフと考えられます。
2. パラメータ（閾値や尤度比較の割合）は、実際の使用ケースに合わせて調整が必要かもしれません。
3. この修正は主に2倍音の誤認識に対処するものであり、他の倍音（3倍音など）に対しては追加の対策が必要かもしれません。

## 今後の改善点

1. より多くの実音声サンプルでテストを行い、パラメータを最適化する。
2. 3倍音など、他の倍音に対する誤認識対策も検討する。
3. 計算効率をさらに改善する方法を検討する。