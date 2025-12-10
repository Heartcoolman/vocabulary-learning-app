/**
 * 设备能力检测器
 *
 * 检测设备硬件和浏览器能力，决定最优配置：
 * - WebGL/GPU 支持
 * - 内存大小
 * - CPU 核心数
 * - 屏幕分辨率
 * - 电池状态
 */

import type { DeviceTier } from '@danci/shared';

/**
 * 详细设备能力信息（内部使用）
 */
export interface DetailedDeviceCapabilities {
  /** 设备等级 */
  tier: DeviceTier;
  /** WebGL 支持 */
  webGL: boolean;
  /** WebGL2 支持 */
  webGL2: boolean;
  /** GPU 信息 */
  gpu: string;
  /** CPU 核心数 */
  hardwareConcurrency: number;
  /** 设备内存 (GB) */
  deviceMemory: number;
  /** 最大纹理大小 */
  maxTextureSize: number;
  /** 支持 OffscreenCanvas */
  supportsOffscreenCanvas: boolean;
  /** 支持 Web Worker */
  supportsWebWorker: boolean;
  /** 是否移动设备 */
  isMobile: boolean;
  /** 电池状态 */
  battery: { charging: boolean; level: number } | null;
  /** 支持的功能 */
  features: {
    visualDetection: boolean;
    lstmPrediction: boolean;
    kalmanFilter: boolean;
    realtimeFusion: boolean;
  };
  /** 建议的检测帧率 */
  recommendedFps: number;
  /** 建议说明 */
  recommendations: string[];
}

/**
 * 检测结果
 */
export interface DeviceCapabilityResult {
  /** 设备能力 */
  capabilities: DetailedDeviceCapabilities;
  /** 设备等级 */
  tier: DeviceTier;
  /** 推荐配置 */
  recommendedConfig: RecommendedConfig;
}

/**
 * 推荐配置
 */
export interface RecommendedConfig {
  /** 推荐检测FPS */
  detectionFps: number;
  /** 推荐视频宽度 */
  videoWidth: number;
  /** 推荐视频高度 */
  videoHeight: number;
  /** 是否启用 Blendshapes */
  enableBlendshapes: boolean;
  /** 是否启用卡尔曼滤波 */
  useKalmanFilter: boolean;
  /** MediaPipe delegate */
  delegate: 'GPU' | 'CPU';
}

/**
 * 设备等级配置映射
 */
const TIER_CONFIGS: Record<DeviceTier, RecommendedConfig> = {
  high: {
    detectionFps: 10,
    videoWidth: 640,
    videoHeight: 480,
    enableBlendshapes: true,
    useKalmanFilter: true,
    delegate: 'GPU',
  },
  medium: {
    detectionFps: 5,
    videoWidth: 480,
    videoHeight: 360,
    enableBlendshapes: true,
    useKalmanFilter: true,
    delegate: 'GPU',
  },
  low: {
    detectionFps: 3,
    videoWidth: 320,
    videoHeight: 240,
    enableBlendshapes: false,
    useKalmanFilter: false,
    delegate: 'CPU',
  },
  unsupported: {
    detectionFps: 0,
    videoWidth: 0,
    videoHeight: 0,
    enableBlendshapes: false,
    useKalmanFilter: false,
    delegate: 'CPU',
  },
};

/**
 * 设备能力检测器类
 */
export class DeviceCapabilityDetector {
  private cachedResult: DeviceCapabilityResult | null = null;

  /**
   * 检测设备能力
   */
  async detect(): Promise<DeviceCapabilityResult> {
    if (this.cachedResult) {
      return this.cachedResult;
    }

    const capabilities = await this.detectCapabilities();
    const tier = this.determineTier(capabilities);
    const recommendedConfig = TIER_CONFIGS[tier];

    // 更新 capabilities 中的 tier
    capabilities.tier = tier;
    capabilities.recommendedFps = recommendedConfig.detectionFps;

    this.cachedResult = {
      capabilities,
      tier,
      recommendedConfig,
    };

    return this.cachedResult;
  }

  /**
   * 检测各项能力
   */
  private async detectCapabilities(): Promise<DetailedDeviceCapabilities> {
    const [webGL, battery] = await Promise.all([this.detectWebGL(), this.detectBattery()]);

    const isMobile = this.detectMobile();
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    const deviceMemory = this.detectMemory();
    const supportsOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
    const supportsWebWorker = typeof Worker !== 'undefined';

    // 确定支持的功能
    const features = {
      visualDetection: webGL.supported && supportsWebWorker,
      lstmPrediction: webGL.supported && deviceMemory >= 4,
      kalmanFilter: hardwareConcurrency >= 4,
      realtimeFusion: true,
    };

    // 生成建议
    const recommendations: string[] = [];
    if (!webGL.supported) {
      recommendations.push('建议使用支持 WebGL 的现代浏览器');
    }
    if (isMobile) {
      recommendations.push('移动设备将使用低功耗模式');
    }
    if (battery && !battery.charging && battery.level < 0.2) {
      recommendations.push('电池电量低，建议充电后使用');
    }

    return {
      tier: 'medium', // 将在后续步骤中更新
      webGL: webGL.supported,
      webGL2: webGL.version >= 2,
      gpu: webGL.gpu,
      hardwareConcurrency,
      deviceMemory,
      maxTextureSize: webGL.maxTextureSize,
      supportsOffscreenCanvas,
      supportsWebWorker,
      isMobile,
      battery,
      features,
      recommendedFps: 5, // 将在后续步骤中更新
      recommendations,
    };
  }

  /**
   * 检测 WebGL 能力
   */
  private detectWebGL(): {
    supported: boolean;
    version: number;
    gpu: string;
    maxTextureSize: number;
  } {
    const result = {
      supported: false,
      version: 0,
      gpu: 'unknown',
      maxTextureSize: 0,
    };

    try {
      const canvas = document.createElement('canvas');

      // 尝试 WebGL2
      let gl: WebGL2RenderingContext | WebGLRenderingContext | null = canvas.getContext('webgl2');
      if (gl) {
        result.supported = true;
        result.version = 2;
      } else {
        // 回退到 WebGL1
        gl = canvas.getContext('webgl');
        if (gl) {
          result.supported = true;
          result.version = 1;
        }
      }

      if (gl) {
        // 获取 GPU 信息
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          result.gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown';
        }

        // 获取最大纹理大小
        result.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
      }
    } catch {
      // WebGL 不可用
    }

    return result;
  }

  /**
   * 检测设备内存
   */
  private detectMemory(): number {
    // deviceMemory API (仅 Chrome)
    if ('deviceMemory' in navigator) {
      return (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    }
    // 默认假设 4GB
    return 4;
  }

  /**
   * 检测电池状态
   */
  private async detectBattery(): Promise<{ charging: boolean; level: number } | null> {
    try {
      if ('getBattery' in navigator) {
        const battery = await (
          navigator as Navigator & {
            getBattery: () => Promise<{
              charging: boolean;
              level: number;
            }>;
          }
        ).getBattery();
        return {
          charging: battery.charging,
          level: battery.level,
        };
      }
    } catch {
      // Battery API 不可用
    }
    return null;
  }

  /**
   * 检测是否移动设备
   */
  private detectMobile(): boolean {
    // 检查 userAgent
    const ua = navigator.userAgent.toLowerCase();
    const mobileKeywords = ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'webos', 'blackberry'];
    const isMobileUA = mobileKeywords.some((keyword) => ua.includes(keyword));

    // 检查触摸支持
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // 检查屏幕尺寸
    const isSmallScreen = window.innerWidth < 768;

    return isMobileUA || (hasTouch && isSmallScreen);
  }

  /**
   * 确定设备等级
   */
  private determineTier(capabilities: DetailedDeviceCapabilities): DeviceTier {
    // 如果不支持 WebGL，返回 unsupported
    if (!capabilities.webGL) {
      return 'unsupported';
    }

    let score = 0;

    // WebGL2 支持 (+3)
    if (capabilities.webGL2) {
      score += 3;
    } else if (capabilities.webGL) {
      score += 1;
    }

    // CPU 核心数 (最高 +3)
    if (capabilities.hardwareConcurrency >= 8) {
      score += 3;
    } else if (capabilities.hardwareConcurrency >= 4) {
      score += 2;
    } else {
      score += 1;
    }

    // 内存 (最高 +3)
    if (capabilities.deviceMemory >= 8) {
      score += 3;
    } else if (capabilities.deviceMemory >= 4) {
      score += 2;
    } else {
      score += 1;
    }

    // GPU 质量 (+2)
    const gpuLower = capabilities.gpu.toLowerCase();
    const highEndGPUs = ['nvidia', 'amd', 'radeon', 'geforce', 'apple m'];
    if (highEndGPUs.some((g) => gpuLower.includes(g))) {
      score += 2;
    } else if (!gpuLower.includes('intel')) {
      score += 1;
    }

    // OffscreenCanvas 支持 (+1)
    if (capabilities.supportsOffscreenCanvas) {
      score += 1;
    }

    // 移动设备惩罚 (-2)
    if (capabilities.isMobile) {
      score -= 2;
    }

    // 电池低电量惩罚 (-2)
    if (
      capabilities.battery &&
      !capabilities.battery.charging &&
      capabilities.battery.level < 0.2
    ) {
      score -= 2;
    }

    // 等级判定
    // 最高 12 分
    if (score >= 9) {
      return 'high';
    } else if (score >= 5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 获取推荐的检测 FPS
   */
  getRecommendedFps(): number {
    return this.cachedResult?.recommendedConfig.detectionFps ?? 5;
  }

  /**
   * 检测是否支持 GPU 加速
   */
  supportsGPU(): boolean {
    return this.cachedResult?.capabilities.webGL ?? false;
  }

  /**
   * 检测是否支持 Web Worker
   */
  supportsWebWorker(): boolean {
    return this.cachedResult?.capabilities.supportsWebWorker ?? typeof Worker !== 'undefined';
  }

  /**
   * 检测是否支持 OffscreenCanvas
   */
  supportsOffscreenCanvas(): boolean {
    return (
      this.cachedResult?.capabilities.supportsOffscreenCanvas ??
      typeof OffscreenCanvas !== 'undefined'
    );
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedResult = null;
  }

  /**
   * 获取当前设备等级
   */
  getTier(): DeviceTier {
    return this.cachedResult?.tier ?? 'medium';
  }

  /**
   * 获取推荐配置
   */
  getRecommendedConfig(): RecommendedConfig {
    return this.cachedResult?.recommendedConfig ?? TIER_CONFIGS.medium;
  }
}

/**
 * 创建设备能力检测器实例
 */
export function createDeviceCapabilityDetector(): DeviceCapabilityDetector {
  return new DeviceCapabilityDetector();
}

/**
 * 全局单例
 */
let globalDetector: DeviceCapabilityDetector | null = null;

/**
 * 获取全局设备能力检测器
 */
export function getDeviceCapabilityDetector(): DeviceCapabilityDetector {
  if (!globalDetector) {
    globalDetector = new DeviceCapabilityDetector();
  }
  return globalDetector;
}
