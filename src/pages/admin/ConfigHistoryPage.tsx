import { useState, useEffect } from 'react';
import { ConfigHistory } from '../../types/models';
import { AlgorithmConfigService } from '../../services/algorithms/AlgorithmConfigService';
import { Clock, MagnifyingGlass, ArrowCounterClockwise } from '../../components/Icon';

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
      console.error('加载配置历史失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...history];

    // 按时间筛选
    if (dateFilter !== 'all') {
      const now = Date.now();
      const filterTime = {
        today: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000
      }[dateFilter];

      filtered = filtered.filter(record => now - record.timestamp < filterTime);
    }

    // 按搜索词筛选
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(record =>
        record.changedBy.toLowerCase().includes(term) ||
        (record.changeReason && record.changeReason.toLowerCase().includes(term))
      );
    }

    setFilteredHistory(filtered);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">加载配置历史中...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-g3-fade-in">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Clock size={32} weight="duotone" className="text-blue-500" />
          <h1 className="text-3xl font-bold text-gray-900">配置历史</h1>
        </div>
        <p className="text-gray-600">
          查看所有算法配置的修改记录
        </p>
      </div>

      {/* 筛选工具栏 */}
      <div className="mb-6 p-6 bg-white border border-gray-200 rounded-xl">
        <div className="flex flex-col md:flex-row gap-4">
          {/* 搜索框 */}
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlass
                size={20}
                weight="bold"
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="搜索修改人或修改原因..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 时间筛选 */}
          <div className="flex gap-2">
            {[
              { value: 'all', label: '全部' },
              { value: 'today', label: '今天' },
              { value: 'week', label: '本周' },
              { value: 'month', label: '本月' }
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => setDateFilter(filter.value as any)}
                className={`
                  px-4 py-2 rounded-lg font-medium transition-all duration-200
                  ${dateFilter === filter.value
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
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
        <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
          <Clock size={64} weight="thin" className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">
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
      second: '2-digit'
    });
  };

  const formatValue = (value: any): string => {
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const getChangedFields = () => {
    const fields: Array<{ key: string; before: any; after: any }> = [];
    
    if (typeof record.previousValue === 'object' && typeof record.newValue === 'object') {
      const allKeys = new Set([
        ...Object.keys(record.previousValue),
        ...Object.keys(record.newValue)
      ]);

      allKeys.forEach(key => {
        const before = (record.previousValue as any)[key];
        const after = (record.newValue as any)[key];
        
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          fields.push({ key, before, after });
        }
      });
    }

    return fields;
  };

  const changedFields = getChangedFields();

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all duration-200">
      {/* 头部信息 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <ArrowCounterClockwise size={20} weight="bold" className="text-blue-500" />
            <span className="font-semibold text-gray-900">{record.changedBy}</span>
            <span className="text-sm text-gray-500">修改了配置</span>
          </div>
          
          {record.changeReason && (
            <div className="flex items-start gap-2 mt-2">
              <span className="text-sm text-gray-600 font-medium">原因：</span>
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
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              变更字段：{changedFields.length} 个
            </span>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {isExpanded ? '收起详情' : '展开详情'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {changedFields.map((field, index) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
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
            <div key={index} className="p-4 bg-gray-50 rounded-lg">
              <div className="font-medium text-gray-900 mb-3">{field.key}</div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 修改前 */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    修改前
                  </div>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                      {formatValue(field.before)}
                    </pre>
                  </div>
                </div>

                {/* 修改后 */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    修改后
                  </div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap break-words">
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
