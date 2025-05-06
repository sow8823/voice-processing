use wasm_bindgen::prelude::*;
use pitch_detection_fixed::detector::pmpm::ProbabilisticMcLeodDetector;
use pitch_detection_fixed::detector::PitchDetector as PitchDetectorTrait;

#[wasm_bindgen]
pub struct ProbabilisticMcLeodPitchDetector {
    detector: ProbabilisticMcLeodDetector<f32>,
}

#[wasm_bindgen]
impl ProbabilisticMcLeodPitchDetector {
    #[wasm_bindgen(constructor)]
    pub fn new(buffer_size: usize, padding: usize) -> ProbabilisticMcLeodPitchDetector {
        let detector = ProbabilisticMcLeodDetector::new(buffer_size, padding);
        ProbabilisticMcLeodPitchDetector { detector }
    }

    /// ピッチ検出用関数
    #[wasm_bindgen]
    pub fn detect_pitch(
        &mut self,
        audio_buffer: &[f32],
        sample_rate: usize,
        power_threshold: f32,
        clarity_threshold: f32,
    ) -> Option<f32> {
        let pitch = self
            .detector
            .get_pitch(audio_buffer, sample_rate, power_threshold, clarity_threshold);
        pitch.map(|p| p.frequency)
    }
}
