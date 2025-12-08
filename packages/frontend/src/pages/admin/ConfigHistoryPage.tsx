import { useState, useEffect } from 'react';
import { ConfigHistory } from '../../types/models';
import { AlgorithmConfigService } from '../../services/algorithms/AlgorithmConfigService';
import { Clock, MagnifyingGlass, ArrowCounterClockwise } from '../../components/Icon';
import { adminLogger } from '../../utils/logger';

/**
 * 配置历史页面
 * 显示所有配置修改记录，支持按时间筛选
 */
export default function ConfigHistoryPage() {
  const [history, setHistory] = useState<ConfigHistory[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<ConfigHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const configService = new AlgorithmConfigService();

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [history, searchTerm, dateFilter]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      const records = await configService.getConfigHistory();
      setHistory(records);
    } catch (error) {
      adminLogger.error({ err: error }, '加载配置历史失败');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    // 防御性检查：确保 history 是数组
    if (!Array.isArray(history)) {
      setFilteredHistory([]);
      return;
    }
    let filtered = [...history];

    // 按时间筛选
    if (dateFilter !== 'all') {
      const now = Date.now();
      const filterTime = {
        today: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
      }[dateFilter];

      filtered = filtered.filter((record) => now - record.timestamp < filterTime);
    }

    // 按搜索词筛选
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (record) =>
          record.changedBy.toLowerCase().includes(term) ||
          (record.changeReason && record.changeReason.toLowerCase().includes(term)),
      );
    }

    setFilteredHistory(filtered);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">加载配置历史中...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-g3-fade-in p-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-3">
          <Clock size={32} weight="duotone" className="text-blue-500" />
          <h1 className="text-3xl font-bold text-gray-900">配置历史</h1>
        </div>
        <p className="text-gray-600">查看所有算法配置的修改记录</p>
      </div>

      {/* 筛选工具栏 */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row">
          {/* 搜索框 */}
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlass
                size={20}
                weight="bold"
                className="absolute left-3 top-1/2 -translate-y-1/2 transform text-gray-400"
              />
              <input
                type="text"
                placeholder="搜索修改人或修改原因..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 时间筛选 */}
          <div className="flex gap-2">
            {[
              { value: 'all', label: '全部' },
              { value: 'today', label: '今天' },
              { value: 'week', label: '本周' },
              { value: 'month', label: '本月' },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => setDateFilter(filter.value as typeof dateFilter)}
                className={`rounded-lg px-4 py-2 font-medium transition-all duration-200 ${
                  dateFilter === filter.value
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } `}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* 统计信息 */}
        <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
          <span>共 {history.length} 条记录</span>
          {filteredHistory.length !== history.length && (
            <span>筛选后 {filteredHistory.length} 条</span>
          )}
        </div>
      </div>

      {/* 历史记录列表 */}
      {filteredHistory.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center">
          <Clock size={64} weight="thin" className="mx-auto mb-4 text-gray-300" />
          <p className="text-lg text-gray-500">
            {history.length === 0 ? '暂无配置修改记录' : '没有符合条件的记录'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredHistory.map((record) => (
            <HistoryRecordCard key={record.id} record={record} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 历史记录卡片组件
 */
interface HistoryRecordCardProps {
  record: ConfigHistory;
}

function HistoryRecordCard({ record }: HistoryRecordCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatValue = (value: unknown): string => {
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const getChangedFields = () => {
    const fields: Array<{ key: string; before: unknown; after: unknown }> = [];

    if (typeof record.previousValue === 'object' && typeof record.newValue === 'object') {
      const allKeys = new Set([
        ...Object.keys(record.previousValue),
        ...Object.keys(record.newValue),
      ]);

      allKeys.forEach((key) => {
        const before = (record.previousValue as Record<string, unknown>)[key];
        const after = (record.newValue as Record<string, unknown>)[key];

        if (JSON.stringify(before) !== JSON.stringify(after)) {
          fields.push({ key, before, after });
        }
      });
    }

    return fields;
  };

  const changedFields = getChangedFields();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 transition-all duration-200 hover:shadow-md">
      {/* 头部信息 */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-3">
            <ArrowCounterClockwise size={20} weight="bold" className="text-blue-500" />
            <span className="font-semibold text-gray-900">{record.changedBy}</span>
            <span className="text-sm text-gray-500">修改了配置</span>
          </div>

          {record.changeReason && (
            <div className="mt-2 flex items-start gap-2">
              <span className="text-sm font-medium text-gray-600">原因：</span>
              <span className="text-sm text-gray-700">{record.changeReason}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock size={16} weight="bold" />
          {formatDate(record.timestamp)}
        </div>
      </div>

      {/* 变更摘要 */}
      {changedFields.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              变更字段：{changedFields.length} 个
            </span>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {isExpanded ? '收起详情' : '展开详情'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {changedFields.map((field, index) => (
              <span
                key={index}
                className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
              >
                {field.key}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 详细变更内容 */}
      {isExpanded && changedFields.length > 0 && (
        <div className="mt-4 space-y-4 border-t border-gray-200 pt-4">
          {changedFields.map((field, index) => (
            <div key={index} className="rounded-lg bg-gray-50 p-4">
              <div className="mb-3 font-medium text-gray-900">{field.key}</div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* 修改前 */}
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase text-gray-500">修改前</div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <pre className="whitespace-pre-wrap break-words text-sm text-gray-800">
                      {formatValue(field.before)}
                    </pre>
                  </div>
                </div>

                {/* 修改后 */}
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase text-gray-500">修改后</div>
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <pre className="whitespace-pre-wrap break-words text-sm text-gray-800">
                      {formatValue(field.after)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
