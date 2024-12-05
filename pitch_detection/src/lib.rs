use wasm_bindgen::prelude::*;
use pitch_detection::detector::mcleod::McLeodDetector;
use pitch_detection::detector::PitchDetector as McLeodPitchTrait;

#[wasm_bindgen]
pub struct McLeodPitchDetector {
    detector: McLeodDetector<f32>,
}

#[wasm_bindgen]
impl McLeodPitchDetector {
    #[wasm_bindgen(constructor)]
    pub fn new(buffer_size: usize, padding: usize) -> McLeodPitchDetector {
        let detector = McLeodDetector::new(buffer_size, padding);
        McLeodPitchDetector { detector }
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
