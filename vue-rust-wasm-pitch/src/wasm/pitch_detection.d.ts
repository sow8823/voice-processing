/* tslint:disable */
/* eslint-disable */
export class McLeodPitchDetector {
  free(): void;
  /**
   * @param {number} buffer_size
   * @param {number} padding
   */
  constructor(buffer_size: number, padding: number);
  /**
   * ピッチ検出用関数
   * @param {Float32Array} audio_buffer
   * @param {number} sample_rate
   * @param {number} power_threshold
   * @param {number} clarity_threshold
   * @returns {number | undefined}
   */
  detect_pitch(audio_buffer: Float32Array, sample_rate: number, power_threshold: number, clarity_threshold: number): number | undefined;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_mcleodpitchdetector_free: (a: number, b: number) => void;
  readonly mcleodpitchdetector_new: (a: number, b: number) => number;
  readonly mcleodpitchdetector_detect_pitch: (a: number, b: number, c: number, d: number, e: number, f: number) => Array;
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
