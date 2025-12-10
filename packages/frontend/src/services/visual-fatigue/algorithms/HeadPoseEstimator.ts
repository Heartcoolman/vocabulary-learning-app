/**
 * 头部姿态估计器
 *
 * 从 MediaPipe Face Mesh 的面部变换矩阵提取头部姿态：
 * - Pitch (俯仰角): 点头，正值表示低头
 * - Yaw (偏航角): 摇头，正值表示右转
 * - Roll (翻滚角): 歪头
 *
 * 疲劳信号：
 * - 频繁点头（头部下垂）
 * - 头部位置不稳定
 */

import type { HeadPose } from '@danci/shared';

/**
 * 头部姿态估计配置
 */
export interface HeadPoseConfig {
  /** 平滑因子，默认 0.3 */
  smoothingFactor: number;
  /** 头部下垂阈值（弧度），默认 0.3 */
  headDropThreshold: number;
  /** 历史窗口大小，默认 30 */
  historySize: number;
}

/**
 * 默认头部姿态配置
 */
export const DEFAULT_HEAD_POSE_CONFIG: HeadPoseConfig = {
  smoothingFactor: 0.3,
  headDropThreshold: 0.3,
  historySize: 30,
};

/**
 * 头部姿态估计结果
 */
export interface HeadPoseResult {
  /** 头部姿态 */
  pose: HeadPose;
  /** 是否有效 */
  isValid: boolean;
  /** 是否检测到头部下垂 */
  isHeadDropping: boolean;
  /** 姿态稳定性 [0-1]，1 表示非常稳定 */
  stability: number;
}

/**
 * 将弧度转换为归一化值 [-1, 1]
 * 假设最大角度为 PI/4 (45度)
 */
function normalizeAngle(radians: number, maxAngle: number = Math.PI / 4): number {
  return Math.max(-1, Math.min(1, radians / maxAngle));
}

/**
 * 头部姿态估计器类
 */
export class HeadPoseEstimator {
  private config: HeadPoseConfig;
  private lastPose: HeadPose = { pitch: 0, yaw: 0, roll: 0 };
  private poseHistory: HeadPose[] = [];

  constructor(config: Partial<HeadPoseConfig> = {}) {
    this.config = { ...DEFAULT_HEAD_POSE_CONFIG, ...config };
  }

  /**
   * 从面部变换矩阵估计头部姿态
   * @param matrix 4x4 面部变换矩阵（MediaPipe 返回，列主序）
   */
  estimateFromMatrix(matrix: number[][] | Float32Array): HeadPoseResult {
    try {
      // 将 Float32Array 转换为 2D 数组（列主序）
      const m = this.convertToMatrix(matrix);

      if (!m || m.length < 4) {
        return this.createInvalidResult();
      }

      // MediaPipe 返回列主序矩阵
      // m[col][row], 所以 m[0] 是第一列，m[1] 是第二列...
      // 旋转矩阵元素（按行主序标记）:
      // r00 = m[0][0], r01 = m[1][0], r02 = m[2][0]
      // r10 = m[0][1], r11 = m[1][1], r12 = m[2][1]
      // r20 = m[0][2], r21 = m[1][2], r22 = m[2][2]

      const r00 = m[0][0];
      const r10 = m[0][1];
      const r20 = m[0][2];
      const r21 = m[1][2];
      const r22 = m[2][2];

      // 从旋转矩阵提取欧拉角 (ZYX 顺序)
      // Pitch (X轴旋转，点头): atan2(r21, r22)
      // Yaw (Y轴旋转，摇头): asin(-r20)
      // Roll (Z轴旋转，歪头): atan2(r10, r00)
      const pitch = Math.atan2(r21, r22);
      const yaw = Math.asin(Math.max(-1, Math.min(1, -r20))); // clamp to avoid NaN
      const roll = Math.atan2(r10, r00);

      // 归一化到 [-1, 1]
      const rawPose: HeadPose = {
        pitch: normalizeAngle(pitch),
        yaw: normalizeAngle(yaw),
        roll: normalizeAngle(roll),
      };

      // 应用平滑
      const smoothedPose = this.smoothPose(rawPose);

      // 更新历史
      this.addToHistory(smoothedPose);

      // 检测头部下垂
      const isHeadDropping = smoothedPose.pitch > this.config.headDropThreshold;

      // 计算稳定性
      const stability = this.calculateStability();

      return {
        pose: smoothedPose,
        isValid: true,
        isHeadDropping,
        stability,
      };
    } catch {
      return this.createInvalidResult();
    }
  }

  /**
   * 从关键点估计头部姿态（备用方法）
   * 使用鼻尖、眼睛中心等关键点
   */
  estimateFromLandmarks(landmarks: { x: number; y: number; z?: number }[]): HeadPoseResult {
    try {
      // 使用关键点索引：
      // 1: 鼻尖
      // 168: 眉心
      // 6: 鼻根
      // 234: 左脸颊
      // 454: 右脸颊

      const noseTip = landmarks[1];
      const foreheadCenter = landmarks[168];
      const noseRoot = landmarks[6];
      const leftCheek = landmarks[234];
      const rightCheek = landmarks[454];

      if (!noseTip || !foreheadCenter || !noseRoot || !leftCheek || !rightCheek) {
        return this.createInvalidResult();
      }

      // 估计 Pitch：鼻尖相对于鼻根的垂直位置
      const pitchRaw = noseTip.y - noseRoot.y;
      const pitch = normalizeAngle(pitchRaw * 5); // 缩放因子

      // 估计 Yaw：左右脸颊的 x 差异
      const yawRaw = (rightCheek.x - leftCheek.x) / 2 - 0.5;
      const yaw = normalizeAngle(yawRaw * 4);

      // 估计 Roll：左右脸颊的 y 差异
      const rollRaw = rightCheek.y - leftCheek.y;
      const roll = normalizeAngle(rollRaw * 4);

      const rawPose: HeadPose = { pitch, yaw, roll };
      const smoothedPose = this.smoothPose(rawPose);
      this.addToHistory(smoothedPose);

      const isHeadDropping = smoothedPose.pitch > this.config.headDropThreshold;
      const stability = this.calculateStability();

      return {
        pose: smoothedPose,
        isValid: true,
        isHeadDropping,
        stability,
      };
    } catch {
      return this.createInvalidResult();
    }
  }

  /**
   * 获取当前头部姿态
   */
  getCurrentPose(): HeadPose {
    return { ...this.lastPose };
  }

  /**
   * 检查是否头部下垂
   */
  isHeadDropping(): boolean {
    return this.lastPose.pitch > this.config.headDropThreshold;
  }

  /**
   * 重置估计器
   */
  reset(): void {
    this.lastPose = { pitch: 0, yaw: 0, roll: 0 };
    this.poseHistory = [];
  }

  /**
   * 转换矩阵格式
   */
  private convertToMatrix(matrix: number[][] | Float32Array): number[][] | null {
    // 如果已经是 4x4 矩阵格式
    if (Array.isArray(matrix) && Array.isArray(matrix[0])) {
      return matrix as number[][];
    }

    // 处理 Float32Array（MediaPipe 返回的格式）
    if (matrix instanceof Float32Array) {
      const arr = Array.from(matrix) as number[];
      if (arr.length >= 16) {
        return [arr.slice(0, 4), arr.slice(4, 8), arr.slice(8, 12), arr.slice(12, 16)];
      }
    }

    // 处理一维数字数组（不太可能走到这里，因为上面已经处理了 number[][]）
    if (Array.isArray(matrix) && matrix.length >= 16 && typeof matrix[0] === 'number') {
      // 强制类型转换，因为我们已经确认是一维数组
      const arr = matrix as unknown as number[];
      return [arr.slice(0, 4), arr.slice(4, 8), arr.slice(8, 12), arr.slice(12, 16)];
    }

    return null;
  }

  /**
   * 应用指数平滑
   */
  private smoothPose(rawPose: HeadPose): HeadPose {
    const alpha = this.config.smoothingFactor;
    return {
      pitch: alpha * rawPose.pitch + (1 - alpha) * this.lastPose.pitch,
      yaw: alpha * rawPose.yaw + (1 - alpha) * this.lastPose.yaw,
      roll: alpha * rawPose.roll + (1 - alpha) * this.lastPose.roll,
    };
  }

  /**
   * 添加到历史记录
   */
  private addToHistory(pose: HeadPose): void {
    this.lastPose = pose;
    this.poseHistory.push(pose);
    if (this.poseHistory.length > this.config.historySize) {
      this.poseHistory.shift();
    }
  }

  /**
   * 计算姿态稳定性
   */
  private calculateStability(): number {
    if (this.poseHistory.length < 5) {
      return 1;
    }

    // 计算姿态变化的标准差
    const pitchValues = this.poseHistory.map((p) => p.pitch);
    const yawValues = this.poseHistory.map((p) => p.yaw);

    const pitchStd = this.standardDeviation(pitchValues);
    const yawStd = this.standardDeviation(yawValues);

    // 将标准差转换为稳定性分数 [0-1]
    // 标准差越小，稳定性越高
    const avgStd = (pitchStd + yawStd) / 2;
    const stability = Math.max(0, 1 - avgStd * 5);

    return stability;
  }

  /**
   * 计算标准差
   */
  private standardDeviation(values: number[]): number {
    const n = values.length;
    if (n === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;

    return Math.sqrt(variance);
  }

  /**
   * 创建无效结果
   */
  private createInvalidResult(): HeadPoseResult {
    return {
      pose: this.lastPose,
      isValid: false,
      isHeadDropping: false,
      stability: 0,
    };
  }
}

/**
 * 创建头部姿态估计器实例
 */
export function createHeadPoseEstimator(config?: Partial<HeadPoseConfig>): HeadPoseEstimator {
  return new HeadPoseEstimator(config);
}
