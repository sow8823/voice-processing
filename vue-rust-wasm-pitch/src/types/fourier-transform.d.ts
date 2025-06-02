declare module 'fourier-transform' {
  /**
   * 高速フーリエ変換（FFT）を実行する関数
   * @param buffer 入力信号の配列（Float32Array）
   * @returns 周波数領域の配列（マグニチュード値）
   */
  export default function fourierTransform(buffer: Float32Array): Float32Array;
}