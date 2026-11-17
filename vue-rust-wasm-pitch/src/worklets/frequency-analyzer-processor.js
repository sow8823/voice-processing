// frequency-analyzer-processor.js
// AudioWorkletProcessorを使用して周波数分析を行うプロセッサ

class FrequencyAnalyzerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // 分析用のAnalyserNodeを作成することはできないため、
    // 必要なデータをメインスレッドに送信し、そこで分析を行う
    this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
    // メインスレッドからのメッセージを処理
    if (event.data.type === 'setConfig') {
      // 設定を更新
      this.bufferSize = event.data.bufferSize || 2048;
      this.hopSize = event.data.hopSize || 1024;
    }
  }

  process(inputs, outputs, parameters) {
    // 入力データがある場合
    if (inputs[0] && inputs[0][0] && inputs[0][0].length > 0) {
      // 入力データをメインスレッドに送信
      const inputData = inputs[0][0];
      
      // Float32Arrayをコピーして送信
      // (直接送信するとデータが変更される可能性があるため)
      const dataToSend = new Float32Array(inputData);
      
      // AudioWorkletProcessorのcurrentTimeプロパティを使用
      this.port.postMessage({
        type: 'audioData',
        data: dataToSend,
        timestamp: currentTime || 0 // AudioWorkletGlobalScopeのcurrentTimeを使用
      });
    }
    
    // trueを返すことで処理を継続
    return true;
  }
}

// プロセッサを登録
registerProcessor('frequency-analyzer-processor', FrequencyAnalyzerProcessor);