import React, { useState } from 'react';
import { Issue, IssueStatus, IssueSeverity } from '../api';
import { X, Wrench } from '../../../../components/Icon';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';

interface Props {
  issues: Issue[];
  loading: boolean;
  total: number;
  onFix: (id: string) => void;
  onIgnore: (id: string) => void;
  onBatch: (ids: string[], action: 'fix' | 'ignore') => void;
  filterStatus: IssueStatus;
  onStatusChange: (s: IssueStatus) => void;
}

const SEVERITY_COLORS: Record<IssueSeverity, 'danger' | 'warning' | 'info'> = {
  error: 'danger',
  warning: 'warning',
  suggestion: 'info',
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  error: '错误',
  warning: '警告',
  suggestion: '建议',
};

const Tabs = ({
  current,
  onChange,
}: {
  current: IssueStatus;
  onChange: (s: IssueStatus) => void;
}) => {
  const tabs: { id: IssueStatus; label: string }[] = [
    { id: 'open', label: '待处理' },
    { id: 'fixed', label: '已修复' },
    { id: 'ignored', label: '已忽略' },
  ];
  return (
    <div className="mb-4 flex border-b border-gray-100 dark:border-slate-700">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            current === t.id
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};

export const IssueListTable: React.FC<Props> = ({
  issues,
  loading,
  total,
  onFix,
  onIgnore,
  onBatch,
  filterStatus,
  onStatusChange,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSelectAll = () => {
    if (selected.size === issues.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(issues.map((i) => i.id)));
    }
  };

  const handleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleBatch = (action: 'fix' | 'ignore') => {
    onBatch(Array.from(selected), action);
    setSelected(new Set());
  };

  return (
    <div className="flex min-h-[500px] flex-col rounded-card border border-gray-100 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-800">
      <div className="px-6 pt-4">
        <Tabs
          current={filterStatus}
          onChange={(s) => {
            onStatusChange(s);
            setSelected(new Set());
          }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 pb-4">
        <div className="text-sm text-gray-500 dark:text-gray-400">共找到 {total} 条记录</div>
        {selected.size > 0 && filterStatus === 'open' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2 duration-g3-fast">
            <span className="mr-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              已选 {selected.size} 项
            </span>
            <Button size="sm" variant="primary" onClick={() => handleBatch('fix')}>
              批量修复
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBatch('ignore')}>
              批量忽略
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-gray-50/50 text-xs uppercase tracking-wider text-gray-500 dark:bg-slate-700/50 dark:text-gray-400">
            <tr>
              <th className="w-12 border-b border-gray-100 p-4 dark:border-slate-700">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                  checked={issues.length > 0 && selected.size === issues.length}
                  onChange={handleSelectAll}
                  disabled={issues.length === 0}
                />
              </th>
              <th className="border-b border-gray-100 p-4 font-semibold dark:border-slate-700">
                单词
              </th>
              <th className="border-b border-gray-100 p-4 font-semibold dark:border-slate-700">
                问题类型
              </th>
              <th className="w-1/3 border-b border-gray-100 p-4 font-semibold dark:border-slate-700">
                描述 & 建议
              </th>
              <th className="border-b border-gray-100 p-4 font-semibold dark:border-slate-700">
                严重等级
              </th>
              {filterStatus === 'open' && (
                <th className="border-b border-gray-100 p-4 text-right font-semibold dark:border-slate-700">
                  操作
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="p-4">
                    <div className="h-8 animate-pulse rounded bg-gray-100 dark:bg-slate-700" />
                  </td>
                </tr>
              ))
            ) : issues.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-gray-400 dark:text-gray-500">
                  没有发现相关记录
                </td>
              </tr>
            ) : (
              issues.map((issue) => (
                <tr
                  key={issue.id}
                  className="group transition-colors hover:bg-gray-50/50 dark:hover:bg-slate-700/30"
                >
                  <td className="p-4 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(issue.id)}
                      onChange={() => handleSelect(issue.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                    />
                  </td>
                  <td className="p-4 align-top">
                    <div className="font-bold text-gray-900 dark:text-white">
                      {issue.wordSpelling}
                    </div>
                    <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      ID: {issue.wordId.slice(0, 6)}
                    </div>
                  </td>
                  <td className="p-4 align-top">
                    <Badge variant="secondary" className="text-xs font-normal">
                      {issue.field}
                    </Badge>
                  </td>
                  <td className="p-4 align-top">
                    <div className="mb-1 text-sm text-gray-700 dark:text-gray-300">
                      {issue.message}
                    </div>
                    {issue.suggestion != null && (
                      <div className="mt-1 inline-block rounded bg-green-50 p-2 text-xs text-green-600 dark:bg-green-900/30 dark:text-green-400">
                        建议:{' '}
                        {typeof issue.suggestion === 'object'
                          ? JSON.stringify(issue.suggestion)
                          : String(issue.suggestion)}
                      </div>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    <Badge variant={SEVERITY_COLORS[issue.severity]}>
                      {SEVERITY_LABEL[issue.severity]}
                    </Badge>
                  </td>
                  {filterStatus === 'open' && (
                    <td className="p-4 text-right align-top">
                      <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/30"
                          onClick={() => onFix(issue.id)}
                          title="应用修复"
                        >
                          <Wrench size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:hover:bg-slate-700"
                          onClick={() => onIgnore(issue.id)}
                          title="忽略"
                        >
                          <X size={16} />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
