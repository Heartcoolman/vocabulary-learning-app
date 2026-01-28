/**
 * 视觉疲劳检测 Web Worker (Classic Mode)
 *
 * 负责运行 MediaPipe 模型推理和疲劳算法计算
 * 核心算法 (EAR, PERCLOS, Blink) 使用 Rust WASM 实现
 */

import type { VisualFatigueMetrics, HeadPose, BlinkEvent, YawnEvent } from '@danci/shared';

// MediaPipe 类型定义 (仅类型)
interface FaceLandmarkerResult {
  faceLandmarks: Array<Array<{ x: number; y: number; z?: number }>>;
  faceBlendshapes?: Array<{
    categories: Array<{ categoryName: string; score: number }>;
  }>;
  facialTransformationMatrixes?: Float32Array[];
}

// 消息类型
export type WorkerMessage =
  | { type: 'init'; config: WorkerInitConfig }
  | { type: 'detect'; image: ImageBitmap; timestamp: number }
  | { type: 'close' };

export interface WorkerInitConfig {
  modelPath: string;
  useGPU: boolean;
  enableBlendshapes: boolean;
}

export type WorkerResponse =
  | { type: 'init-result'; success: boolean; error?: string }
  | { type: 'detect-result'; result: WorkerDetectionResult };

export interface WorkerDetectionResult {
  metrics: VisualFatigueMetrics;
  faceDetected: boolean;
  blinkEvent: BlinkEvent | null;
  yawnEvent: YawnEvent | null;
  processingTime: number;
}

// 状态管理
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM bindings require dynamic types
let faceLandmarker: any = null;
let isInitialized = false;

// WASM 算法实例
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM bindings require dynamic types
let wasmEarCalculator: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM bindings require dynamic types
let wasmPerclosCalculator: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM bindings require dynamic types
let wasmBlinkDetector: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM bindings require dynamic types
let wasmYawnDetector: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM bindings require dynamic types
let wasmHeadPoseEstimator: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM bindings require dynamic types
let wasmBlendshapeAnalyzer: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM bindings require dynamic types
let wasmFatigueScoreCalculator: any = null;

let config: WorkerInitConfig = {
  modelPath: '/models/mediapipe/face_landmarker.task',
  useGPU: true,
  enableBlendshapes: true,
};

// 监听消息
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data;

  switch (type) {
    case 'init':
      await handleInit(e.data.config);
      break;
    case 'detect':
      if ('image' in e.data) {
        handleDetect(e.data.image, e.data.timestamp);
      }
      break;
    case 'close':
      handleClose();
      break;
  }
};

/**
 * 初始化 MediaPipe 和 算法
 */
async function handleInit(initConfig: WorkerInitConfig) {
  try {
    console.log('[Worker] handleInit called with config:', initConfig);
    config = initConfig;

    // 1. 加载 WASM 模块 (所有7个算法)
    console.log('[Worker] Loading WASM module...');
    const wasmJsResponse = await fetch('/wasm/visual_fatigue_wasm.js');
    const wasmJsCode = await wasmJsResponse.text();
    const wasmJsBlob = new Blob([wasmJsCode], { type: 'application/javascript' });
    const wasmJsUrl = URL.createObjectURL(wasmJsBlob);
    const wasmModule = await import(/* @vite-ignore */ wasmJsUrl);
    URL.revokeObjectURL(wasmJsUrl);

    await wasmModule.default('/wasm/visual_fatigue_wasm_bg.wasm');

    wasmEarCalculator = new wasmModule.EARCalculator(0.3);
    wasmPerclosCalculator = new wasmModule.PERCLOSCalculator(60.0, 0.25, 10);
    wasmBlinkDetector = new wasmModule.BlinkDetector(0.25, 50.0, 400.0);
    wasmYawnDetector = new wasmModule.YawnDetector(0.6, 2000.0, 8000.0, 300.0);
    wasmHeadPoseEstimator = new wasmModule.HeadPoseEstimator(0.3, 0.3, 30);
    wasmBlendshapeAnalyzer = new wasmModule.BlendshapeAnalyzer(0.3, 0.3, 30);
    wasmFatigueScoreCalculator = new wasmModule.FatigueScoreCalculator();
    console.log('[Worker] WASM algorithms loaded (all 7 modules)');

    // 2. 动态加载 MediaPipe
    console.log('[Worker] Importing MediaPipe...');
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

    console.log('[Worker] Resolving fileset...');
    const filesetResolver = await FilesetResolver.forVisionTasks('/models/mediapipe/wasm');
    console.log('[Worker] Fileset resolved');

    console.log('[Worker] Creating FaceLandmarker...');
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: config.modelPath,
        delegate: config.useGPU ? 'GPU' : 'CPU',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: config.enableBlendshapes,
      outputFacialTransformationMatrixes: true,
    });
    console.log('[Worker] FaceLandmarker created successfully');

    isInitialized = true;
    postMessage({ type: 'init-result', success: true });
  } catch (error) {
    console.error('[Worker] Init failed:', error);
    postMessage({
      type: 'init-result',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * 执行检测
 */
function handleDetect(image: ImageBitmap, _timestamp: number) {
  if (!isInitialized || !faceLandmarker) {
    image.close();
    return;
  }

  const startTime = performance.now();

  try {
    // 1. 推理
    console.log('[Worker Debug] Starting detection (GPU: ' + config.useGPU + ')');

    // 如果这里卡住，说明是在推理过程中，或者 TFLite Delegate 创建时
    const result = faceLandmarker.detect(image) as FaceLandmarkerResult;

    console.log('[Worker Debug] Detection finished');

    // 2. 处理结果
    // 关键修复：算法内部依赖 Date.now() 做窗口剔除，而 timestamp 是 performance.now()。
    // 必须使用 Date.now() 传给算法，否则样本会被当作几年前的数据即使剔除。
    const processingTime = Date.now();
    const detectionResult = processResult(result, startTime, processingTime);

    // 3. 发回主线程
    postMessage({
      type: 'detect-result',
      result: detectionResult,
    });
  } catch (error) {
    console.error('[Worker] Detection failed:', error);
    // 发送空结果防止主线程卡死
    postMessage({
      type: 'detect-result',
      result: createEmptyResult(startTime),
    });
  } finally {
    // 必须关闭 ImageBitmap 释放内存
    image.close();
  }
}

/**
 * 处理推理结果
 */
function processResult(
  result: FaceLandmarkerResult,
  startTime: number,
  now: number,
): WorkerDetectionResult {
  // 检查是否检测到面部
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return createEmptyResult(startTime);
  }

  const landmarks = result.faceLandmarks[0];

  // 计算 EAR (WASM 增强版)
  const LEFT_EYE_CONTOUR = [
    33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7,
  ];
  const RIGHT_EYE_CONTOUR = [
    362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382,
  ];
  const LEFT_IRIS = 468;
  const RIGHT_IRIS = 473;

  const coords = new Float64Array(102); // 34点 × 3坐标
  let idx = 0;

  for (const i of LEFT_EYE_CONTOUR) {
    coords[idx++] = landmarks[i].x;
    coords[idx++] = landmarks[i].y;
    coords[idx++] = landmarks[i].z ?? 0;
  }
  for (const i of RIGHT_EYE_CONTOUR) {
    coords[idx++] = landmarks[i].x;
    coords[idx++] = landmarks[i].y;
    coords[idx++] = landmarks[i].z ?? 0;
  }
  if (landmarks.length > LEFT_IRIS) {
    coords[idx++] = landmarks[LEFT_IRIS].x;
    coords[idx++] = landmarks[LEFT_IRIS].y;
    coords[idx++] = landmarks[LEFT_IRIS].z ?? 0;
    coords[idx++] = landmarks[RIGHT_IRIS].x;
    coords[idx++] = landmarks[RIGHT_IRIS].y;
    coords[idx++] = landmarks[RIGHT_IRIS].z ?? 0;
  } else {
    coords[idx++] = (landmarks[33].x + landmarks[133].x) / 2;
    coords[idx++] = (landmarks[33].y + landmarks[133].y) / 2;
    coords[idx++] = 0;
    coords[idx++] = (landmarks[362].x + landmarks[263].x) / 2;
    coords[idx++] = (landmarks[362].y + landmarks[263].y) / 2;
    coords[idx++] = 0;
  }

  const earResult = wasmEarCalculator.calculate_enhanced(coords);
  const ear = earResult.avg_ear; // 平滑后的EAR (用于显示和PERCLOS)
  const rawEar = (earResult.left_ear + earResult.right_ear) / 2; // 原始EAR (用于眨眼检测)
  const earIsValid = earResult.is_valid;
  earResult.free();

  // 调试：输出 EAR 结果
  if (!earIsValid) {
    console.warn('[Worker Debug] EAR invalid');
  } else if (rawEar < 0.25 && Math.random() < 0.1) {
    console.log('[Worker Debug] EAR LOW:', rawEar.toFixed(3), 'smoothed:', ear.toFixed(3));
  }

  // 更新 PERCLOS (使用平滑后的EAR)
  wasmPerclosCalculator.add_sample(ear, now);
  const perclosResult = wasmPerclosCalculator.calculate();
  const perclosValue = perclosResult.perclos;
  const perclosIsValid = perclosResult.is_valid;
  perclosResult.free();

  // 检测眨眼 (使用原始EAR以捕捉快速变化)
  let blinkEvent: BlinkEvent | null = null;
  const wasmBlinkEvent = earIsValid ? wasmBlinkDetector.detect_blink(rawEar, now) : null;
  if (wasmBlinkEvent) {
    blinkEvent = { timestamp: wasmBlinkEvent.timestamp, duration: wasmBlinkEvent.duration };
    wasmBlinkEvent.free();
  }
  const blinkStats = wasmBlinkDetector.get_stats();
  const blinkRate = blinkStats.blink_rate;
  const avgBlinkDuration = blinkStats.avg_blink_duration;
  const blinkIsValid = blinkStats.blink_count > 0;
  blinkStats.free();

  if (blinkEvent) {
    console.log('[Worker Debug] Blink detected!', blinkEvent);
  }

  // 检测打哈欠
  let yawnEvent: YawnEvent | null = null;
  const mouthCoords = new Float64Array(12);
  mouthCoords[0] = landmarks[13].x;
  mouthCoords[1] = landmarks[13].y;
  mouthCoords[2] = landmarks[13].z ?? 0;
  mouthCoords[3] = landmarks[14].x;
  mouthCoords[4] = landmarks[14].y;
  mouthCoords[5] = landmarks[14].z ?? 0;
  mouthCoords[6] = landmarks[61].x;
  mouthCoords[7] = landmarks[61].y;
  mouthCoords[8] = landmarks[61].z ?? 0;
  mouthCoords[9] = landmarks[291].x;
  mouthCoords[10] = landmarks[291].y;
  mouthCoords[11] = landmarks[291].z ?? 0;

  const marResult = wasmYawnDetector.process(mouthCoords, now);
  const marValue = marResult.mar;
  marResult.free();

  const wasmYawnEvent = wasmYawnDetector.get_last_yawn_event();
  if (wasmYawnEvent) {
    yawnEvent = {
      startTime: wasmYawnEvent.start_time,
      endTime: wasmYawnEvent.end_time,
      duration: wasmYawnEvent.duration,
    };
    wasmYawnEvent.free();
  }

  const yawnStats = wasmYawnDetector.get_stats();
  const yawnCount = yawnStats.yawn_count;
  yawnStats.free();

  if (yawnEvent) {
    console.log('[Worker Debug] Yawn detected!', yawnEvent);
  }

  // 估计头部姿态
  let headPose: HeadPose = { pitch: 0, yaw: 0, roll: 0 };
  let headStability = 1;
  let isHeadDropping = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM bindings require dynamic types
  let headPoseResult: any = null;

  if (result.facialTransformationMatrixes && result.facialTransformationMatrixes[0]) {
    const matrixObj = result.facialTransformationMatrixes[0] as { data?: Float32Array };
    const matrixData = matrixObj.data || (matrixObj as unknown as Float32Array);

    if (matrixData && matrixData.length >= 16) {
      const matrixF64 = new Float64Array(16);
      for (let i = 0; i < 16; i++) {
        matrixF64[i] = matrixData[i];
      }
      headPoseResult = wasmHeadPoseEstimator.estimate_from_matrix(matrixF64);
    }
  }

  if (!headPoseResult || !headPoseResult.is_valid) {
    headPoseResult = wasmHeadPoseEstimator.estimate_from_landmarks_full(landmarks);
  }

  if (headPoseResult && headPoseResult.is_valid) {
    headPose = { pitch: headPoseResult.pitch, yaw: headPoseResult.yaw, roll: headPoseResult.roll };
    headStability = headPoseResult.stability;
    isHeadDropping = headPoseResult.is_head_dropping;
  }
  headPoseResult?.free?.();

  // 分析 Blendshapes
  let expressionFatigueScore = 0;
  let squintIntensity = 0;

  if (config.enableBlendshapes && result.faceBlendshapes && result.faceBlendshapes[0]) {
    const categories = result.faceBlendshapes[0].categories;
    const getScore = (name: string) => categories.find((c) => c.categoryName === name)?.score ?? 0;
    const blendshapeScores = new Float64Array([
      getScore('eyeSquintLeft'),
      getScore('eyeSquintRight'),
      getScore('browDownLeft'),
      getScore('browDownRight'),
      getScore('eyeBlinkLeft'),
      getScore('eyeBlinkRight'),
      getScore('jawOpen'),
      getScore('browInnerUp'),
    ]);

    const blendshapeResult = wasmBlendshapeAnalyzer.analyze(blendshapeScores);
    expressionFatigueScore = blendshapeResult.fatigue_score;
    squintIntensity = blendshapeResult.eye_squint;
    blendshapeResult.free();
  }

  // 计算综合疲劳评分
  const fatigueInput = new Float64Array([
    perclosValue,
    blinkRate,
    avgBlinkDuration,
    yawnCount,
    headPose.pitch,
    headStability,
    isHeadDropping ? 1 : 0,
    expressionFatigueScore,
    squintIntensity,
    perclosIsValid ? 1 : 0,
    blinkIsValid ? 1 : 0,
    1, // yawn always valid
    1, // headPose always valid
    config.enableBlendshapes ? 1 : 0,
  ]);

  const wasmBreakdown = wasmFatigueScoreCalculator.calculate(fatigueInput);
  const fatigueBreakdown = {
    perclosScore: wasmBreakdown.perclos_score,
    blinkScore: wasmBreakdown.blink_score,
    yawnScore: wasmBreakdown.yawn_score,
    headPoseScore: wasmBreakdown.head_pose_score,
    expressionScore: wasmBreakdown.expression_score,
    totalScore: wasmBreakdown.total_score,
    confidence: wasmBreakdown.confidence,
  };
  wasmBreakdown.free();

  // 构建指标
  const metrics: VisualFatigueMetrics = {
    eyeAspectRatio: ear,
    blinkRate,
    avgBlinkDuration,
    perclos: perclosValue,
    yawnCount,
    headPose,
    gazeOffScreenRatio: 0,
    visualFatigueScore: fatigueBreakdown.totalScore,
    timestamp: now,
    confidence: fatigueBreakdown.confidence,
    earValue: ear,
    marValue,
    expressionFatigueScore,
    squintIntensity,
  };

  return {
    metrics,
    faceDetected: true,
    blinkEvent,
    yawnEvent,
    processingTime: performance.now() - startTime,
  };
}

function createEmptyResult(startTime: number): WorkerDetectionResult {
  return {
    metrics: {
      eyeAspectRatio: -1,
      blinkRate: 0,
      avgBlinkDuration: 0,
      perclos: 0,
      yawnCount: 0,
      headPose: { pitch: 0, yaw: 0, roll: 0 },
      gazeOffScreenRatio: 0,
      visualFatigueScore: 0,
      timestamp: Date.now(),
      confidence: 0,
    },
    faceDetected: false,
    blinkEvent: null,
    yawnEvent: null,
    processingTime: performance.now() - startTime,
  };
}

function handleClose() {
  // 释放 WASM 资源
  wasmEarCalculator?.free?.();
  wasmPerclosCalculator?.free?.();
  wasmBlinkDetector?.free?.();
  wasmYawnDetector?.free?.();
  wasmHeadPoseEstimator?.free?.();
  wasmBlendshapeAnalyzer?.free?.();
  wasmFatigueScoreCalculator?.free?.();

  if (faceLandmarker && typeof faceLandmarker.close === 'function') {
    faceLandmarker.close();
  }
  self.close();
}
