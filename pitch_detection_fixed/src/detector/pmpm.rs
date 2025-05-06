//! The Probabilistic McLeod Pitch Method (PMPM) is an extension of the McLeod Pitch Method (MPM).
//! It adds probabilistic processing to improve pitch detection accuracy.
//!
//! Like MPM, PMPM is based on finding peaks of the *normalized square difference* function.
//! However, PMPM evaluates multiple peak candidates probabilistically across different cutoff values.
//! This approach helps to improve pitch detection in complex signals.

use crate::detector::internals::normalized_square_difference;
use crate::detector::internals::DetectorInternals;
use crate::detector::internals::Pitch;
use crate::detector::PitchDetector;
use crate::float::Float;
use crate::utils::buffer::square_sum;
use crate::utils::peak::{PeakCorrection, detect_peaks, correct_peak};

// PMPM定数
const PMPM_CUTOFF_BEGIN: f64 = 0.8;
const PMPM_N_CUTOFFS: usize = 10;
const PMPM_PA: f64 = 0.01;
const PMPM_PROB_DIST: f64 = 0.15;
const MPM_CUTOFF: f64 = 0.01;
const MPM_SMALL_CUTOFF: f64 = 0.5;
const MPM_LOWER_PITCH_CUTOFF: f64 = 80.0;

/// A probabilistic extension of the McLeod Pitch Detector
pub struct ProbabilisticMcLeodDetector<T>
where
    T: Float + std::iter::Sum,
{
    internals: DetectorInternals<T>,
}

impl<T> ProbabilisticMcLeodDetector<T>
where
    T: Float + std::iter::Sum,
{
    pub fn new(size: usize, padding: usize) -> Self {
        let internals = DetectorInternals::new(size, padding);
        ProbabilisticMcLeodDetector { internals }
    }
}

impl<T> PitchDetector<T> for ProbabilisticMcLeodDetector<T>
where
    T: Float + std::iter::Sum,
{
    fn get_pitch(
        &mut self,
        signal: &[T],
        sample_rate: usize,
        power_threshold: T,
        clarity_threshold: T,
    ) -> Option<Pitch<T>> {
        assert_eq!(signal.len(), self.internals.size);

        if square_sum(signal) < power_threshold {
            return None;
        }
        let result_ref = self.internals.buffers.get_real_buffer();
        let result = &mut result_ref.borrow_mut()[..];

        normalized_square_difference(signal, &mut self.internals.buffers, result);
        probabilistic_pitch_from_peaks(
            result,
            sample_rate,
            clarity_threshold,
        )
    }
}

/// Calculate pitch using a probabilistic approach to evaluate multiple peak candidates
/// across different cutoff values, similar to the C++ implementation
fn probabilistic_pitch_from_peaks<T>(
    input: &[T],
    sample_rate: usize,
    _clarity_threshold: T,
) -> Option<Pitch<T>>
where
    T: Float,
{
    let sample_rate_t = T::from_usize(sample_rate).unwrap();
    
    // t0_with_probability に相当するベクトル
    let mut period_probabilities: Vec<(T, T)> = Vec::new();
    
    // 複数のカットオフ値でピーク検出を繰り返す
    let mut cutoff = T::from_f64(PMPM_CUTOFF_BEGIN).unwrap();
    let cutoff_increment = T::from_f64(MPM_CUTOFF).unwrap();
    let small_cutoff = T::from_f64(MPM_SMALL_CUTOFF).unwrap();
    
    for _ in 0..PMPM_N_CUTOFFS {
        // ピーク検出
        let peaks: Vec<(usize, T)> = detect_peaks(input).collect();
        
        if peaks.is_empty() {
            continue;
        }
        
        // 最大振幅を見つける
        let mut highest_amplitude = T::neg_infinity();
        for &(_, amplitude) in &peaks {
            if amplitude > highest_amplitude {
                highest_amplitude = amplitude;
            }
        }
        
        // 有効なピーク候補を収集
        let mut estimates: Vec<(T, T)> = Vec::new();
        for &(idx, amplitude) in &peaks {
            if amplitude > small_cutoff {
                // パラボラ補間を適用
                let corrected = correct_peak((idx, amplitude), input, PeakCorrection::Quadratic);
                estimates.push(corrected);
                
                if corrected.1 > highest_amplitude {
                    highest_amplitude = corrected.1;
                }
            }
        }
        
        if estimates.is_empty() {
            continue;
        }
        
        // 実際のカットオフ値を計算
        let actual_cutoff = cutoff * highest_amplitude;
        let mut period = T::zero();
        
        // カットオフを超える最初のピークを見つける
        for &(pos, amplitude) in &estimates {
            if amplitude >= actual_cutoff {
                period = pos;
                break;
            }
        }
        
        // 確率値を更新
        let a = if period != T::zero() { T::one() } else { T::from_f64(PMPM_PA).unwrap() };
        let prob_dist = T::from_f64(PMPM_PROB_DIST).unwrap();
        
        // 既存のエントリを探す
        let mut found = false;
        for entry in &mut period_probabilities {
            if (entry.0 - period).abs() < T::from_f64(0.001).unwrap() {
                entry.1 = entry.1 + a * prob_dist;
                found = true;
                break;
            }
        }
        
        // 見つからなければ新しいエントリを追加
        if !found && period != T::zero() {
            period_probabilities.push((period, a * prob_dist));
        }
        
        // カットオフ値を更新
        cutoff = cutoff + cutoff_increment;
    }
    
    // 周期から周波数への変換
    let mut frequency_probabilities: Vec<(T, T)> = Vec::new();
    let lower_pitch_cutoff = T::from_f64(MPM_LOWER_PITCH_CUTOFF).unwrap();
    
    for (period, probability) in period_probabilities {
        let frequency = sample_rate_t / period;
        
        if frequency > lower_pitch_cutoff {
            frequency_probabilities.push((frequency, probability));
        }
    }
    
    if frequency_probabilities.is_empty() {
        return None;
    }
    
    // 最も確率の高い周波数を選択
    let mut best_frequency = T::zero();
    let mut best_probability = T::neg_infinity();
    
    for (frequency, probability) in frequency_probabilities {
        if probability > best_probability {
            best_frequency = frequency;
            best_probability = probability;
        }
    }
    
    // 結果を返す
    Some(Pitch {
        frequency: best_frequency,
        clarity: best_probability,
    })
}