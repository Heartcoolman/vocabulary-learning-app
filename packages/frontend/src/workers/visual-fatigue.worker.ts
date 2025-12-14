/**
 * 视觉疲劳检测 Web Worker (Classic Mode)
 *
 * 负责运行 MediaPipe 模型推理和疲劳算法计算
 * 使用 Dynamic Import 以兼容 Classic Worker (允许 importScripts)
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
let faceLandmarker: any = null;
let isInitialized = false;

// 算法实例 (动态加载)
let earCalculator: any = null;
let perclosCalculator: any = null;
let blinkDetector: any = null;
let yawnDetector: any = null;
let headPoseEstimator: any = null;
let blendshapeAnalyzer: any = null;
let fatigueScoreCalculator: any = null;

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

    // 1. 动态加载算法模块
    console.log('[Worker] Importing algorithms...');
    // 使用 import() 动态加载本地模块
    const algorithms = await import('../services/visual-fatigue/algorithms');

    earCalculator = new algorithms.EARCalculator();
    perclosCalculator = new algorithms.PERCLOSCalculator();
    blinkDetector = new algorithms.BlinkDetector();
    yawnDetector = new algorithms.YawnDetector();
    headPoseEstimator = new algorithms.HeadPoseEstimator();
    blendshapeAnalyzer = new algorithms.BlendshapeAnalyzer();
    fatigueScoreCalculator = new algorithms.FatigueScoreCalculator();
    console.log('[Worker] Algorithms loaded');

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
function handleDetect(image: ImageBitmap, timestamp: number) {
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

  // 调试：输出关键点数据
  // console.log('[Worker Debug] Landmarks sample:', landmarks[33], landmarks[133]);

  // 计算 EAR
  const earResult = earCalculator.calculate(landmarks);
  const ear = earResult.avgEAR;

  // 调试：输出 EAR 结果
  if (earResult.avgEAR === 0 || !earResult.isValid) {
    console.warn('[Worker Debug] EAR invalid:', earResult);
  } else if (ear < 0.3) {
    // 重点关注闭眼瞬间
    console.log('[Worker Debug] EAR LOW (Blink possible):', ear.toFixed(3));
  } else if (Math.random() < 0.01) {
    // 降低正常值打印频率
    console.log('[Worker Debug] EAR valid:', ear.toFixed(3));
  }

  // 更新 PERCLOS
  perclosCalculator.addSample(ear, now);
  const perclosResult = perclosCalculator.calculate();

  // 检测眨眼
  const blinkEvent = earResult.isValid ? blinkDetector.detectBlink(ear, now) : null;
  const blinkStats = blinkDetector.getStats();

  if (blinkEvent) {
    console.log('[Worker Debug] Blink detected!', blinkEvent);
  }

  // 检测打哈欠
  const yawnResult = yawnDetector.process(landmarks, now);
  const yawnEvent = yawnResult.yawnEvent;
  const yawnStats = yawnDetector.getStats();

  if (yawnEvent) {
    console.log('[Worker Debug] Yawn detected!', yawnEvent);
  }

  // 估计头部姿态
  let headPose: HeadPose = { pitch: 0, yaw: 0, roll: 0 };
  let headStability = 1;
  let isHeadDropping = false;

  if (result.facialTransformationMatrixes && result.facialTransformationMatrixes[0]) {
    const matrixObj = result.facialTransformationMatrixes[0] as { data?: Float32Array };
    const matrixData = matrixObj.data || (matrixObj as unknown as Float32Array);

    if (matrixData && matrixData.length >= 16) {
      const headPoseResult = headPoseEstimator.estimateFromMatrix(matrixData);
      if (headPoseResult.isValid) {
        headPose = headPoseResult.pose;
        headStability = headPoseResult.stability;
        isHeadDropping = headPoseResult.isHeadDropping;
      }
    } else {
      const headPoseResult = headPoseEstimator.estimateFromLandmarks(landmarks);
      if (headPoseResult.isValid) {
        headPose = headPoseResult.pose;
        headStability = headPoseResult.stability;
        isHeadDropping = headPoseResult.isHeadDropping;
      }
    }
  } else {
    const headPoseResult = headPoseEstimator.estimateFromLandmarks(landmarks);
    if (headPoseResult.isValid) {
      headPose = headPoseResult.pose;
      headStability = headPoseResult.stability;
      isHeadDropping = headPoseResult.isHeadDropping;
    }
  }

  // 分析 Blendshapes
  let expressionFatigueScore = 0;
  let squintIntensity = 0;

  if (config.enableBlendshapes && result.faceBlendshapes && result.faceBlendshapes[0]) {
    const blendshapeResult = blendshapeAnalyzer.analyze(result.faceBlendshapes[0].categories);
    expressionFatigueScore = blendshapeResult.fatigueScore;
    squintIntensity = blendshapeResult.eyeSquint;

    // Blendshape 辅助眨眼
    const categories = result.faceBlendshapes[0].categories;
    const eyeBlinkLeft = categories.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0;
    const eyeBlinkRight = categories.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? 0;
    const blinkIntensity = (eyeBlinkLeft + eyeBlinkRight) / 2;

    blinkDetector.detectBlinkFromBlendshape(blinkIntensity, now);
  }

  // 计算综合疲劳评分
  // Note: FatigueInputMetrics type is not directly imported, assuming it's compatible with 'any' or inferred.
  const fatigueInput: any = {
    // Using 'any' for FatigueInputMetrics as it's not globally imported
    perclos: perclosResult.perclos,
    blinkRate: blinkStats.blinkRate,
    avgBlinkDuration: blinkStats.avgBlinkDuration,
    yawnCount: yawnStats.yawnCount,
    headPitch: headPose.pitch,
    headStability,
    isHeadDropping,
    expressionFatigueScore,
    squintIntensity,
    validity: {
      perclos: perclosResult.isValid,
      blink: blinkStats.isValid,
      yawn: yawnStats.isValid,
      headPose: true,
      expression: config.enableBlendshapes,
    },
  };

  const fatigueBreakdown = fatigueScoreCalculator.calculate(fatigueInput);

  // 构建指标
  const metrics: VisualFatigueMetrics = {
    eyeAspectRatio: ear,
    blinkRate: blinkStats.blinkRate,
    avgBlinkDuration: blinkStats.avgBlinkDuration,
    perclos: perclosResult.perclos,
    yawnCount: yawnStats.yawnCount,
    headPose,
    gazeOffScreenRatio: 0,
    visualFatigueScore: fatigueBreakdown.totalScore,
    timestamp: now,
    confidence: fatigueBreakdown.confidence,
    earValue: ear,
    marValue: yawnResult.mar.mar,
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
  if (faceLandmarker && typeof faceLandmarker.close === 'function') {
    faceLandmarker.close();
  }
  self.close();
}
