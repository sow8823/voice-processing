use std::path::PathBuf;

use pitch_detection_fixed::detector::mcleod::McLeodDetector;
use pitch_detection_fixed::detector::PitchDetector;
use pitch_detection_fixed::detector::{autocorrelation::AutocorrelationDetector, yin::YINDetector};
use pitch_detection_fixed::float::Float;

// For reading in `.wav` files
use hound;

#[derive(Debug)]
struct Signal<T> {
    sample_rate: usize,
    data: Vec<T>,
}

/// 基本周波数と2倍音を含む合成信号を生成するテスト
#[test]
fn test_octave_detection() {
    const SAMPLE_RATE: usize = 44100;
    const SIZE: usize = 1024;
    const POWER_THRESHOLD: f64 = 5.0;
    const CLARITY_THRESHOLD: f64 = 0.8;

    // 基本周波数（220Hz）と2倍音（440Hz）を含む信号を生成
    // 2倍音の振幅を基本周波数より大きくして、誤認識が起きやすい状況を作る
    let fundamental_freq = 220.0;
    let second_harmonic_freq = 440.0;
    let dt = 1.0 / SAMPLE_RATE as f64;
    
    let signal: Vec<f64> = (0..SIZE)
        .map(|x| {
            let t = x as f64 * dt;
            // 基本周波数の振幅を1.0、2倍音の振幅を1.5に設定
            1.0 * (2.0 * std::f64::consts::PI * fundamental_freq * t).sin() +
            5.0 * (2.0 * std::f64::consts::PI * second_harmonic_freq * t).sin()
        })
        .collect();

    // 各検出器でテスト
    test_detector("McLeod", &signal, SAMPLE_RATE, POWER_THRESHOLD, CLARITY_THRESHOLD, fundamental_freq);
    // test_detector("Autocorrelation", &signal, SAMPLE_RATE, POWER_THRESHOLD, CLARITY_THRESHOLD, fundamental_freq);
    // test_detector("YIN", &signal, SAMPLE_RATE, POWER_THRESHOLD, CLARITY_THRESHOLD, fundamental_freq);
}

/// 特定の検出器で信号のピッチを検出し、期待される基本周波数と比較する
fn test_detector(detector_name: &str, signal: &[f64], sample_rate: usize, power_threshold: f64, clarity_threshold: f64, expected_freq: f64) {
    println!("Testing {} detector", detector_name);
    
    let size = signal.len();
    let padding = size / 2;
    
    let mut detector = match detector_name {
        "McLeod" => Box::new(McLeodDetector::<f64>::new(size, padding)) as Box<dyn PitchDetector<f64>>,
        "Autocorrelation" => Box::new(AutocorrelationDetector::<f64>::new(size, padding)) as Box<dyn PitchDetector<f64>>,
        "YIN" => Box::new(YINDetector::<f64>::new(size, padding)) as Box<dyn PitchDetector<f64>>,
        _ => panic!("Unknown detector {}", detector_name),
    };
    
    let pitch = detector.get_pitch(signal, sample_rate, power_threshold, clarity_threshold);
    
    match pitch {
        Some(pitch) => {
            let frequency = pitch.frequency;
            let clarity = pitch.clarity;
            println!(
                "{} detector: Detected frequency: {:.2} Hz, Clarity: {:.2}, Expected: {:.2} Hz",
                detector_name, frequency, clarity, expected_freq
            );
            
            // 検出された周波数が期待される基本周波数に近いことを確認
            // 許容誤差は5%
            let error_margin = expected_freq * 0.05;
            assert!(
                (frequency - expected_freq).abs() < error_margin,
                "Detected frequency {:.2} Hz is not close enough to expected frequency {:.2} Hz",
                frequency, expected_freq
            );
        },
        None => {
            panic!("{} detector failed to detect pitch", detector_name);
        }
    }
}

/// 実際の音声ファイルを使ったテスト
#[test]
fn test_real_audio_octave_detection() {
    // テスト用の音声ファイルがある場合はそれを使用
    if let Ok(signal) = wav_file_to_signal::<f64>(samples_path("tenor-trombone-C3.wav"), 0, 1024) {
        const POWER_THRESHOLD: f64 = 300.0;
        const CLARITY_THRESHOLD: f64 = 0.6;
        
        // C3の基本周波数は約130.81 Hz
        let expected_freq = 130.81;
        
        test_detector("McLeod", &signal.data, signal.sample_rate, POWER_THRESHOLD, CLARITY_THRESHOLD, expected_freq);
        test_detector("Autocorrelation", &signal.data, signal.sample_rate, POWER_THRESHOLD, CLARITY_THRESHOLD, expected_freq);
        test_detector("YIN", &signal.data, signal.sample_rate, POWER_THRESHOLD, CLARITY_THRESHOLD, expected_freq);
    } else {
        println!("Skipping real audio test: Sample file not found");
    }
}

/// Get the full path of `wav` file specified by `file_name`.
fn samples_path(file_name: &str) -> String {
    // `d` is an absolute path to the source directory of the project
    let mut d = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // all audio samples are in this subfolder
    d.push("tests/samples");
    d.push(file_name);

    d.to_str().unwrap().into()
}

fn wav_file_to_signal<T: Float>(
    file_name: String,
    seek_start: usize,
    num_samples: usize,
) -> Result<Signal<T>, Box<dyn std::error::Error>> {
    println!("Opening \"{}\"", file_name);
    let mut reader = hound::WavReader::open(file_name)?;
    let sample_rate = reader.spec().sample_rate as usize;
    let data: Vec<T> = reader
        .samples::<i32>()
        .skip(seek_start)
        .map(|s| T::from_i32(s.unwrap()).unwrap())
        .take(num_samples)
        .collect();

    Ok(Signal { sample_rate, data })
}