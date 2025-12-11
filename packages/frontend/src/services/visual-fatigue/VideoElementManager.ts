/**
 * Video 元素单例管理器
 *
 * 确保整个应用只有一个用于视觉疲劳检测的 video 元素，
 * 避免多个组件实例创建多个 video 元素导致的资源浪费和冲突。
 */

class VideoElementManager {
  private static instance: VideoElementManager;
  private videoElement: HTMLVideoElement | null = null;
  private refCount = 0;

  private constructor() {
    // 私有构造函数，确保单例
  }

  /**
   * 获取单例实例
   */
  static getInstance(): VideoElementManager {
    if (!VideoElementManager.instance) {
      VideoElementManager.instance = new VideoElementManager();
    }
    return VideoElementManager.instance;
  }

  /**
   * 获取共享的 video 元素
   * 如果不存在则创建，增加引用计数
   */
  acquire(): HTMLVideoElement {
    if (!this.videoElement) {
      this.videoElement = this.createVideoElement();
      document.body.appendChild(this.videoElement);
      console.log('[VideoElementManager] Video element created and appended to body');
    }
    this.refCount++;
    console.log(`[VideoElementManager] Video element acquired, refCount: ${this.refCount}`);
    return this.videoElement;
  }

  /**
   * 释放 video 元素引用
   * 当引用计数归零时，移除并销毁 video 元素
   */
  release(): void {
    if (this.refCount > 0) {
      this.refCount--;
      console.log(`[VideoElementManager] Video element released, refCount: ${this.refCount}`);
    }

    if (this.refCount <= 0 && this.videoElement) {
      // 停止所有媒体流
      if (this.videoElement.srcObject) {
        const stream = this.videoElement.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        this.videoElement.srcObject = null;
      }

      // 从 DOM 中移除
      this.videoElement.remove();
      this.videoElement = null;
      this.refCount = 0;
      console.log('[VideoElementManager] Video element destroyed');
    }
  }

  /**
   * 获取当前 video 元素（不增加引用计数）
   */
  getElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * 获取当前引用计数
   */
  getRefCount(): number {
    return this.refCount;
  }

  /**
   * 检查 video 元素是否存在
   */
  hasElement(): boolean {
    return this.videoElement !== null;
  }

  /**
   * 创建隐藏的 video 元素
   */
  private createVideoElement(): HTMLVideoElement {
    const video = document.createElement('video');
    video.id = 'visual-fatigue-shared-video';
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.setAttribute('muted', 'true');

    // 隐藏 video 元素
    video.style.position = 'fixed';
    video.style.width = '320px';
    video.style.height = '240px';
    video.style.top = '0';
    video.style.left = '0';
    video.style.visibility = 'hidden';
    video.style.pointerEvents = 'none';
    video.style.zIndex = '-9999';

    return video;
  }
}

// 导出单例实例
export const videoElementManager = VideoElementManager.getInstance();

export default VideoElementManager;
