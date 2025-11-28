/**
 * AMAS Neural Pipeline - 数据流可视化页面
 *
 * 功能：
 * - 实时展示AMAS六层架构的数据处理流程
 * - 交互式节点，点击查看详情
 * - 故障注入模拟，观察系统响应
 * - 数据包流动动画
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CircleNotch } from '../../components/Icon';
import {
  getPipelineSnapshot,
  getPacketTrace,
  injectFault,
  PipelineSnapshot,
  PacketTrace,
  FaultInjectionRequest,
  FaultInjectionResponse,
} from '../../services/aboutApi';
import { FlowCanvas } from './components/pipeline';

// ==================== 常量配置 ====================

const REFRESH_INTERVAL = 3000; // 3秒刷新

// ==================== 主组件 ====================

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);

  // 获取管道快照
  const fetchSnapshot = useCallback(async () => {
    try {
      const data = await getPipelineSnapshot();
      setSnapshot(data);
      setError(null);
    } catch (err) {
      console.error('获取管道快照失败:', err);
      setError('无法连接到服务器');
    } finally {
      setLoading(false);
    }
  }, []);

  // 定时刷新
  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  // 获取数据包轨迹
  const handleFetchTrace = useCallback(async (packetId: string): Promise<PacketTrace> => {
    return await getPacketTrace(packetId);
  }, []);

  // 故障注入
  const handleInjectFault = useCallback(
    async (request: FaultInjectionRequest): Promise<FaultInjectionResponse> => {
      const result = await injectFault(request);
      // 立即刷新以看到注入的故障包
      await fetchSnapshot();
      return result;
    },
    [fetchSnapshot]
  );

  // 加载状态
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <CircleNotch className="animate-spin text-cyan-500" size={48} />
          <p className="text-slate-400 text-sm">加载管道数据...</p>
        </motion.div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="text-red-500 text-lg mb-2">连接失败</div>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <button
            onClick={fetchSnapshot}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
          >
            重试
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-950">
      {/* 页面标题 */}
      <header className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
        <div className="p-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              AMAS Neural Pipeline
            </h1>
            <p className="text-xs text-slate-500">
              实时数据流可视化 · {REFRESH_INTERVAL / 1000}秒刷新
            </p>
          </div>
        </div>
      </header>

      {/* 主画布 */}
      <FlowCanvas
        snapshot={snapshot}
        onInjectFault={handleInjectFault}
        onFetchTrace={handleFetchTrace}
      />
    </div>
  );
}
