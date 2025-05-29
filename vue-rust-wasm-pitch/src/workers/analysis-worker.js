/**
 * 音声分析を担当するWebワーカー
 * 音声データを分析し、ピッチ検出や周波数分析を行う
 */

// WASMモジュールをインポート（ピッチ検出ライブラリ）
// 注意: 実際の環境では、importScriptsのパスを適切に設定する必要があります
importScripts('../wasm/pitch_detection.js');

let pitchDetectionModule = null;

/**
 * WASMモジュールの初期化
 * @returns {Promise<Object>} - 初期化されたWASMモジュール
 */
async function initializePitchDetection() {
  if (!pitchDetectionModule) {
    try {
      // 注意: 実際の環境では、PitchDetectionの関数名が異なる可能性があります
      pitchDetectionModule = await PitchDetection();
      console.log('ピッチ検出モジュールが初期化されました');
    } catch (error) {
      console.error('ピッチ検出モジュールの初期化に失敗しました:', error);
      throw error;
    }
  }
  return pitchDetectionModule;
}

// メインスレッドからのメッセージを処理
self.onmessage = async function(e) {
  const { action, data } = e.data;
  
  switch (action) {
    case 'analyzeAudio':
      try {
        // ピッチ検出モジュールを初期化
        const module = await initializePitchDetection();
        
        const { audioData, sampleRate, frameInterval, options } = data;
        
        // 分析結果を格納する配列
        const pitchData = [];
        const frequencyData = [];
        const timestamps = [];
        
        // 音声の長さを計算
        const duration = audioData.length / sampleRate;
        
        // フレーム数を計算
        const totalFrames = Math.ceil(duration / frameInterval);
        
        // 進捗報告の間隔
        const progressStep = Math.max(1, Math.floor(totalFrames / 100));
        
        // バッファサイズ
        const bufferSize = 2048;
        
        // FFTサイズ
        const fftSize = bufferSize * 2;
        const frequencyBinCount = fftSize / 2;
        
        // 各フレームを分析
        for (let frame = 0; frame < totalFrames; frame++) {
          const currentTime = frame * frameInterval;
          
          // 現在の時間位置のオーディオデータを取得
          const startSample = Math.floor(currentTime * sampleRate);
          
          // 一時バッファを作成
          const tempBuffer = new Float32Array(bufferSize);
          
          // オーディオデータをコピー
          for (let i = 0; i < bufferSize; i++) {
            const sampleIndex = startSample + i;
            if (sampleIndex < audioData.length) {
              tempBuffer[i] = audioData[sampleIndex];
            }
          }
          
          // ピッチを検出
          // 注意: 実際の環境では、detectPitchの関数名やパラメータが異なる可能性があります
          const pitch = module.detectPitch(tempBuffer, sampleRate, options);
          
          // 周波数データを計算
          // 注意: 実際の環境では、getFrequencyDataの関数名やパラメータが異なる可能性があります
          const currentFrequencyData = new Uint8Array(frequencyBinCount);
          module.getFrequencyData(tempBuffer, currentFrequencyData);
          
          // 分析データを保存
          timestamps.push(currentTime);
          pitchData.push(pitch);
          frequencyData.push(currentFrequencyData);
          
          // 進捗を報告
          if (frame % progressStep === 0) {
            self.postMessage({
              action: 'analysisProgress',
              progress: frame / totalFrames,
              requestId: data.requestId
            });
          }
        }
        
        // 分析結果を返す
        self.postMessage({
          action: 'analysisComplete',
          result: {
            pitchData,
            frequencyData,
            timestamps
          },
          requestId: data.requestId
        });
      } catch (error) {
        self.postMessage({
          action: 'analysisError',
          error: error.message,
          requestId: data.requestId
        });
      }
      break;
  }
};