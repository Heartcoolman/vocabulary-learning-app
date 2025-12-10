/**
 * EAR (Eye Aspect Ratio) 计算器
 *
 * EAR 公式: (|P2-P6| + |P3-P5|) / (2 * |P1-P4|)
 * - P1, P4: 眼角点（水平）
 * - P2, P3: 上眼睑点
 * - P5, P6: 下眼睑点
 *
 * 正常睁眼 EAR: 0.25-0.35
 * 闭眼 EAR: < 0.20
 */

import { EYE_LANDMARKS } from '@danci/shared';

/**
 * 3D 点坐标
 */
interface Point3D {
  x: number;
  y: number;
  z?: number;
}

/**
 * EAR 计算结果
 */
export interface EARResult {
  /** 左眼 EAR */
  leftEAR: number;
  /** 右眼 EAR */
  rightEAR: number;
  /** 双眼平均 EAR */
  avgEAR: number;
  /** 是否有效 */
  isValid: boolean;
}

/**
 * 计算两点之间的欧几里得距离
 */
function euclideanDistance(p1: Point3D, p2: Point3D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = (p2.z ?? 0) - (p1.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 眼睛关键点索引类型
 */
type EyeIndices = {
  P1: number;
  P2: number;
  P3: number;
  P4: number;
  P5: number;
  P6: number;
};

/**
 * 计算单只眼睛的 EAR
 */
function computeSingleEyeEAR(landmarks: Point3D[], eyeIndices: EyeIndices): number {
  try {
    const p1 = landmarks[eyeIndices.P1];
    const p2 = landmarks[eyeIndices.P2];
    const p3 = landmarks[eyeIndices.P3];
    const p4 = landmarks[eyeIndices.P4];
    const p5 = landmarks[eyeIndices.P5];
    const p6 = landmarks[eyeIndices.P6];

    // 检查所有点是否存在
    if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) {
      return -1;
    }

    // 计算垂直距离
    const vertical1 = euclideanDistance(p2, p6);
    const vertical2 = euclideanDistance(p3, p5);

    // 计算水平距离
    const horizontal = euclideanDistance(p1, p4);

    // 防止除零
    if (horizontal < 0.001) {
      return -1;
    }

    // EAR = (|P2-P6| + |P3-P5|) / (2 * |P1-P4|)
    const ear = (vertical1 + vertical2) / (2 * horizontal);

    return ear;
  } catch {
    return -1;
  }
}

/**
 * EAR 计算器类
 */
export class EARCalculator {
  private smoothingFactor: number;
  private lastEAR: number = 0.3;

  constructor(smoothingFactor: number = 0.3) {
    this.smoothingFactor = smoothingFactor;
  }

  /**
   * 计算双眼 EAR
   * @param landmarks MediaPipe Face Mesh 返回的 468/478 个关键点
   */
  calculate(landmarks: Point3D[]): EARResult {
    // 验证关键点数量
    if (!landmarks || landmarks.length < 400) {
      return {
        leftEAR: -1,
        rightEAR: -1,
        avgEAR: -1,
        isValid: false,
      };
    }

    // 计算左眼 EAR
    const leftEAR = computeSingleEyeEAR(landmarks, EYE_LANDMARKS.LEFT);

    // 计算右眼 EAR
    const rightEAR = computeSingleEyeEAR(landmarks, EYE_LANDMARKS.RIGHT);

    // 检查有效性
    if (leftEAR < 0 || rightEAR < 0) {
      return {
        leftEAR,
        rightEAR,
        avgEAR: -1,
        isValid: false,
      };
    }

    // 计算平均 EAR
    const rawAvgEAR = (leftEAR + rightEAR) / 2;

    // 应用指数平滑（减少噪声）
    const smoothedEAR =
      this.smoothingFactor * rawAvgEAR + (1 - this.smoothingFactor) * this.lastEAR;
    this.lastEAR = smoothedEAR;

    return {
      leftEAR,
      rightEAR,
      avgEAR: smoothedEAR,
      isValid: true,
    };
  }

  /**
   * 判断眼睛是否闭合
   * @param ear 当前 EAR 值
   * @param threshold 闭眼阈值（默认 0.2）
   */
  isEyeClosed(ear: number, threshold: number = 0.2): boolean {
    return ear > 0 && ear < threshold;
  }

  /**
   * 重置平滑状态
   */
  reset(): void {
    this.lastEAR = 0.3;
  }
}

/**
 * 创建 EAR 计算器实例
 */
export function createEARCalculator(smoothingFactor?: number): EARCalculator {
  return new EARCalculator(smoothingFactor);
}
