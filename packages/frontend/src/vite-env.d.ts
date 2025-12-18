/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Visual Fatigue WASM Module
declare module '/wasm/visual_fatigue_wasm.js' {
  // EAR Calculator
  export class EARCalculator {
    constructor(smoothing_factor?: number | null);
    calculate(landmarks_js: any): EARResult;
    calculate_from_coords(coords: Float64Array): EARResult;
    calculate_enhanced(coords: Float64Array): EnhancedEARResult;
    is_eye_closed(ear: number, threshold?: number | null): boolean;
    reset(): void;
    free(): void;
  }

  export class EARResult {
    readonly left_ear: number;
    readonly right_ear: number;
    readonly avg_ear: number;
    readonly is_valid: boolean;
    free(): void;
  }

  export class EnhancedEARResult {
    readonly left_ear: number;
    readonly right_ear: number;
    readonly avg_ear: number;
    readonly left_ear_multi: number;
    readonly right_ear_multi: number;
    readonly iris_visibility: number;
    readonly confidence: number;
    readonly is_valid: boolean;
    free(): void;
  }

  // PERCLOS Calculator
  export class PERCLOSCalculator {
    constructor(
      window_size_seconds?: number | null,
      ear_threshold?: number | null,
      sample_rate?: number | null,
    );
    add_sample(ear: number, timestamp: number): void;
    calculate(): PERCLOSResult;
    reset(): void;
    free(): void;
  }

  export class PERCLOSResult {
    readonly perclos: number;
    readonly total_frames: number;
    readonly closed_frames: number;
    readonly window_duration: number;
    readonly is_valid: boolean;
    free(): void;
  }

  // Blink Detector
  export class BlinkDetector {
    constructor(
      ear_threshold?: number | null,
      min_blink_duration?: number | null,
      max_blink_duration?: number | null,
    );
    detect_blink(ear: number, timestamp: number): BlinkEvent | undefined;
    get_stats(): BlinkStats;
    reset(): void;
    free(): void;
  }

  export class BlinkEvent {
    readonly timestamp: number;
    readonly duration: number;
    free(): void;
  }

  export class BlinkStats {
    readonly blink_rate: number;
    readonly avg_blink_duration: number;
    readonly blink_count: number;
    free(): void;
  }

  // Yawn Detector
  export class YawnDetector {
    constructor(
      mar_threshold?: number | null,
      min_yawn_duration?: number | null,
      max_yawn_duration?: number | null,
      window_size_seconds?: number | null,
    );
    calculate_mar(coords: Float64Array): MARResult;
    calculate_mar_from_landmarks(landmarks_js: any): MARResult;
    detect_yawn(mar: number, timestamp: number): YawnEvent | undefined;
    process(coords: Float64Array, timestamp: number): MARResult;
    process_from_landmarks(landmarks_js: any, timestamp: number): MARResult;
    get_last_yawn_event(): YawnEvent | undefined;
    get_stats(): YawnStats;
    get_yawn_count(): number;
    set_mar_threshold(threshold: number): void;
    reset(): void;
    free(): void;
  }

  export class MARResult {
    readonly mar: number;
    readonly is_valid: boolean;
    free(): void;
  }

  export class YawnEvent {
    readonly start_time: number;
    readonly end_time: number;
    readonly duration: number;
    free(): void;
  }

  export class YawnStats {
    readonly yawn_count: number;
    readonly avg_yawn_duration: number;
    readonly window_duration: number;
    readonly is_valid: boolean;
    free(): void;
  }

  // Head Pose Estimator
  export class HeadPoseEstimator {
    constructor(
      smoothing_factor?: number | null,
      head_drop_threshold?: number | null,
      history_size?: number | null,
    );
    estimate_from_matrix(matrix: Float64Array): HeadPoseResult;
    estimate_from_landmarks(coords: Float64Array): HeadPoseResult;
    estimate_from_landmarks_full(landmarks_js: any): HeadPoseResult;
    get_current_pose(): HeadPose;
    is_head_dropping(): boolean;
    reset(): void;
    free(): void;
  }

  export class HeadPose {
    readonly pitch: number;
    readonly yaw: number;
    readonly roll: number;
    free(): void;
  }

  export class HeadPoseResult {
    readonly pitch: number;
    readonly yaw: number;
    readonly roll: number;
    readonly is_valid: boolean;
    readonly is_head_dropping: boolean;
    readonly stability: number;
    free(): void;
  }

  // Blendshape Analyzer
  export class BlendshapeAnalyzer {
    constructor(
      smoothing_factor?: number | null,
      squint_threshold?: number | null,
      history_size?: number | null,
    );
    analyze(scores: Float64Array): BlendshapeAnalysis;
    analyze_from_blendshapes(blendshapes_js: any): BlendshapeAnalysis;
    is_squinting(): boolean;
    get_squint_intensity(): number;
    get_fatigue_expression(): number;
    reset(): void;
    free(): void;
  }

  export class BlendshapeAnalysis {
    readonly eye_blink: number;
    readonly eye_squint: number;
    readonly brow_down: number;
    readonly jaw_open: number;
    readonly fatigue_score: number;
    readonly confidence: number;
    readonly is_valid: boolean;
    free(): void;
  }

  // Fatigue Score Calculator
  export class FatigueScoreCalculator {
    constructor();
    calculate(input: Float64Array): FatigueScoreBreakdown;
    set_weights(
      perclos: number,
      blink: number,
      yawn: number,
      head_pose: number,
      expression: number,
    ): void;
    get_fatigue_level(score: number): number;
    get_fatigue_trend(): number;
    get_current_score(): number;
    reset(): void;
    free(): void;
  }

  export class FatigueScoreBreakdown {
    readonly perclos_score: number;
    readonly blink_score: number;
    readonly yawn_score: number;
    readonly head_pose_score: number;
    readonly expression_score: number;
    readonly total_score: number;
    readonly confidence: number;
    free(): void;
  }

  export class FatigueWeights {
    readonly perclos: number;
    readonly blink: number;
    readonly yawn: number;
    readonly head_pose: number;
    readonly expression: number;
    free(): void;
  }

  export function init(): void;
  export default function __wbg_init(
    module_or_path?: string | URL | Request | Response | BufferSource | WebAssembly.Module,
  ): Promise<any>;
}
