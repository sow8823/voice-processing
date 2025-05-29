/**
 * 検索処理を担当するWebワーカー
 * 分析データを保持し、再生位置に対応するフレームを効率的に検索する
 */

// 分析データを保持する変数
let analysisData = null;

// メインスレッドからのメッセージを処理
self.onmessage = function(e) {
  const { action, data } = e.data;
  
  switch (action) {
    case 'init':
      // 初期化時に全分析データを受け取る
      analysisData = data.analysisData;
      self.postMessage({ action: 'initialized' });
      break;
      
    case 'findFrame':
      // 指定された時間に最も近いフレームを検索
      const targetTime = data.currentTime;
      const frameIndex = binarySearchClosestTime(analysisData.timestamps, targetTime);
      
      // 結果を返す
      self.postMessage({
        action: 'frameFound',
        frameIndex: frameIndex,
        frameData: {
          pitch: analysisData.pitchData[frameIndex],
          frequencyData: analysisData.frequencyData[frameIndex]
        },
        requestId: data.requestId // リクエストIDを返して非同期処理を追跡
      });
      break;
  }
};

/**
 * 二分探索で最も近い時間のインデックスを検索する関数
 * @param {Array<number>} timestamps - 時間の配列
 * @param {number} targetTime - 検索する時間
 * @returns {number} - 最も近い時間のインデックス
 */
function binarySearchClosestTime(timestamps, targetTime) {
  if (!timestamps || timestamps.length === 0) return -1;
  
  // 範囲外の場合は端の値を返す
  if (targetTime <= timestamps[0]) return 0;
  if (targetTime >= timestamps[timestamps.length - 1]) return timestamps.length - 1;
  
  let left = 0;
  let right = timestamps.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    
    if (timestamps[mid] === targetTime) {
      return mid; // 完全一致
    }
    
    if (timestamps[mid] < targetTime) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  // 最も近い値を返す
  const leftValue = timestamps[right];
  const rightValue = timestamps[left];
  
  return Math.abs(leftValue - targetTime) < Math.abs(rightValue - targetTime) ? right : left;
}