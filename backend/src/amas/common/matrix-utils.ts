/**
 * AMAS 矩阵运算工具模块
 *
 * 提供 LinUCB/LinTS 模型所需的矩阵操作函数
 * 集中管理 Cholesky 分解和正则化矩阵创建逻辑
 */

import { amasLogger } from '../../logger';

/**
 * Cholesky分解: A = L L^T
 *
 * 用于 BanditModel 反序列化时重新计算L矩阵
 * 包含对称化处理和增强的数值稳定性检查
 *
 * @param A 输入矩阵（会被复制，不会修改原矩阵）
 * @param d 矩阵维度
 * @param lambda 正则化系数（可选，默认1.0）
 * @returns Cholesky分解结果L矩阵，失败时返回null
 */
export function choleskyDecompose(
  A: Float32Array,
  d: number,
  lambda: number = 1.0
): Float32Array | null {
  try {
    // 复制矩阵，避免修改原数据
    const matrix = new Float32Array(A);

    // 对称化处理：确保矩阵是对称的
    for (let i = 0; i < d; i++) {
      for (let j = i + 1; j < d; j++) {
        const avg = (matrix[i * d + j] + matrix[j * d + i]) / 2;
        // 检查平均值的有效性
        if (!Number.isFinite(avg)) {
          matrix[i * d + j] = 0;
          matrix[j * d + i] = 0;
        } else {
          matrix[i * d + j] = avg;
          matrix[j * d + i] = avg;
        }
      }
    }

    // 确保对角线元素至少为lambda（正则化）
    for (let i = 0; i < d; i++) {
      const diag = matrix[i * d + i];
      if (!Number.isFinite(diag) || diag < lambda) {
        matrix[i * d + i] = lambda;
      }
    }

    const L = new Float32Array(d * d);
    const epsilon = 1e-9; // 数值稳定性阈值

    for (let i = 0; i < d; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = matrix[i * d + j];
        for (let k = 0; k < j; k++) {
          sum -= L[i * d + k] * L[j * d + k];
        }

        if (i === j) {
          // 对角元素：如果sum过小或为负，使用正则化值
          if (sum <= epsilon || !Number.isFinite(sum)) {
            sum = lambda + epsilon;
          }
          L[i * d + j] = Math.sqrt(sum);
        } else {
          // 非对角元素：确保除数不为零
          const divisor = Math.max(L[j * d + j], epsilon);
          L[i * d + j] = sum / divisor;
          // 限制非对角元素的范围，防止数值溢出
          if (!Number.isFinite(L[i * d + j])) {
            L[i * d + j] = 0;
          }
        }
      }
    }

    // 最终检查：确保所有元素都是有限数
    for (let i = 0; i < L.length; i++) {
      if (!Number.isFinite(L[i])) {
        amasLogger.warn({ position: i }, '[AMAS] Cholesky分解后仍有无效值');
        return null;
      }
    }

    return L;
  } catch (error) {
    amasLogger.warn({ err: error }, '[AMAS] Cholesky分解异常');
    return null;
  }
}

/**
 * 创建正则化单位矩阵 (I * lambda)
 *
 * 用于初始化 A 矩阵或 Cholesky 分解失败时的回退
 *
 * @param d 矩阵维度
 * @param lambda 对角线值（正则化系数）
 * @returns d*d 的对角矩阵，对角线元素为 lambda
 */
export function createRegularizedIdentity(d: number, lambda: number): Float32Array {
  const I = new Float32Array(d * d);
  for (let i = 0; i < d; i++) {
    I[i * d + i] = lambda;
  }
  return I;
}

/**
 * 检查数组是否包含 NaN/Infinity 值
 *
 * @param arr 输入数组
 * @returns 如果包含无效值返回 true
 */
export function hasInvalidValues(arr: Float32Array | number[]): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      return true;
    }
  }
  return false;
}

/**
 * 清理数组中的 NaN/Infinity 值，用 0 替换
 *
 * @param arr 输入 Float32Array
 * @returns 清理后的新 Float32Array
 */
export function sanitizeFloat32Array(arr: Float32Array): Float32Array {
  const result = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    result[i] = Number.isFinite(arr[i]) ? arr[i] : 0;
  }
  return result;
}

/**
 * 清理 number[] 中的无效值
 *
 * @param arr 输入数组
 * @returns 清理后的新数组
 */
export function sanitizeNumberArray(arr: number[]): number[] {
  return arr.map((v) => (Number.isFinite(v) ? v : 0));
}
