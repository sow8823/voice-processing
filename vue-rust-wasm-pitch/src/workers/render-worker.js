/**
 * 描画前処理を担当するWebワーカー
 * 周波数データからヒートマップ用のピクセルデータを生成する
 */

// メインスレッドからのメッセージを処理
self.onmessage = function(e) {
  const { action, data } = e.data;
  
  switch (action) {
    case 'prepareHeatMap':
      // 周波数データからヒートマップ用のピクセルデータを生成
      const { frequencyData, width, height } = data;
      const pixelData = generateHeatMapPixels(frequencyData, width, height);
      
      // 結果を返す
      self.postMessage({
        action: 'heatMapPrepared',
        pixelData: pixelData,
        requestId: data.requestId
      }, [pixelData.buffer]); // Transferable Objectsを使用して高速化
      break;
  }
};

/**
 * ヒートマップ用のピクセルデータを生成する関数
 * @param {Uint8Array} frequencyData - 周波数データ
 * @param {number} width - 画像の幅
 * @param {number} height - 画像の高さ
 * @returns {Uint8ClampedArray} - RGBA値を格納したピクセルデータ
 */
function generateHeatMapPixels(frequencyData, width, height) {
  // RGBA値を格納するUint8ClampedArray
  const pixels = new Uint8ClampedArray(width * height * 4);
  
  const binCount = frequencyData.length;
  const binWidth = width / binCount;
  
  for (let i = 0; i < binCount; i++) {
    const value = frequencyData[i];
    const intensity = value / 255;
    
    // 色を計算（ヒートマップ）
    const color = getHeatMapColor(intensity);
    
    // 縦線を描画
    const x = Math.floor(i * binWidth);
    const barWidth = Math.ceil(binWidth);
    
    for (let j = 0; j < barWidth; j++) {
      const pixelX = x + j;
      if (pixelX < width) {
        for (let y = 0; y < height; y++) {
          const index = (y * width + pixelX) * 4;
          pixels[index] = color.r;     // R
          pixels[index + 1] = color.g; // G
          pixels[index + 2] = color.b; // B
          pixels[index + 3] = 255;     // A
        }
      }
    }
  }
  
  return pixels;
}

/**
 * 強度から色を計算する関数
 * @param {number} intensity - 0～1の強度値
 * @returns {Object} - RGB値を含むオブジェクト
 */
function getHeatMapColor(intensity) {
  // 青から赤へのグラデーション
  if (intensity < 0.2) {
    return { r: 0, g: 0, b: Math.floor(intensity * 5 * 180) + 75 };
  } else if (intensity < 0.4) {
    return { r: 0, g: Math.floor((intensity - 0.2) * 5 * 255), b: Math.floor((0.4 - intensity) * 5 * 180) + 75 };
  } else if (intensity < 0.6) {
    return { r: Math.floor((intensity - 0.4) * 5 * 255), g: 255, b: 0 };
  } else if (intensity < 0.8) {
    return { r: 255, g: Math.floor((0.8 - intensity) * 5 * 255), b: 0 };
  } else {
    return { r: 255, g: Math.floor((intensity - 0.8) * 5 * 255), b: Math.floor((intensity - 0.8) * 5 * 255) };
  }
}