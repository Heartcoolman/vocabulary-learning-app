/**
 * 设备类型检测工具
 * 用于 EVM (Encoding Variability Metric) 情境编码
 */

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

let cachedDeviceType: DeviceType | null = null;

/**
 * 检测当前设备类型
 * 规则：
 * - mobile: 屏幕宽度 < 768px 或 UA 包含 Mobile/Android/iPhone
 * - tablet: 768px ≤ 屏幕宽度 < 1024px 或 UA 包含 iPad/Tablet
 * - desktop: 其他情况
 */
export function detectDeviceType(): DeviceType {
  if (cachedDeviceType) {
    return cachedDeviceType;
  }

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'desktop';
  }

  const ua = navigator.userAgent.toLowerCase();
  const width = window.innerWidth;

  // Check for mobile
  const mobileKeywords = ['mobile', 'android', 'iphone', 'ipod', 'webos', 'blackberry'];
  const isMobileUA = mobileKeywords.some((keyword) => ua.includes(keyword)) && !ua.includes('ipad');
  const isSmallScreen = width < 768;

  if (isMobileUA || isSmallScreen) {
    cachedDeviceType = 'mobile';
    return 'mobile';
  }

  // Check for tablet
  const tabletKeywords = ['ipad', 'tablet'];
  const isTabletUA = tabletKeywords.some((keyword) => ua.includes(keyword));
  const isMediumScreen = width >= 768 && width < 1024;

  if (isTabletUA || isMediumScreen) {
    cachedDeviceType = 'tablet';
    return 'tablet';
  }

  // Default to desktop
  cachedDeviceType = 'desktop';
  return 'desktop';
}

/**
 * 获取设备类型（缓存版本，性能更好）
 */
export function getDeviceType(): DeviceType {
  return cachedDeviceType ?? detectDeviceType();
}

/**
 * 重置设备类型缓存（用于测试或窗口大小变化）
 */
export function resetDeviceTypeCache(): void {
  cachedDeviceType = null;
}
