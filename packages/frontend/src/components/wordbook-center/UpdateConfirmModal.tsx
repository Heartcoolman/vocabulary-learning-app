import { Modal, Button } from '../ui';
import { ArrowRight, CircleNotch } from '../Icon';
import type { UpdateInfo } from '../../services/client';

interface UpdateConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  update: UpdateInfo | null;
  isLoading?: boolean;
}

export function UpdateConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  update,
  isLoading = false,
}: UpdateConfirmModalProps) {
  if (!update) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="更新词书" maxWidth="sm">
      <div className="mb-4">
        <p className="mb-3 text-gray-600 dark:text-gray-300">
          词书 <span className="font-medium text-gray-900 dark:text-white">{update.name}</span>{' '}
          有新版本可用
        </p>
        <div className="flex items-center justify-center gap-3 rounded-lg bg-gray-50 p-3 dark:bg-slate-700">
          <span className="rounded bg-gray-200 px-2 py-1 font-mono text-sm dark:bg-slate-600">
            v{update.currentVersion || '?'}
          </span>
          <ArrowRight aria-hidden="true" className="h-4 w-4 text-gray-400" />
          <span className="rounded bg-green-100 px-2 py-1 font-mono text-sm text-green-700 dark:bg-green-900/40 dark:text-green-400">
            v{update.newVersion}
          </span>
        </div>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          更新将保留你的学习进度，仅同步词书内容变更。
        </p>
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" fullWidth onClick={onClose} disabled={isLoading}>
          稍后
        </Button>
        <Button type="button" variant="primary" fullWidth onClick={onConfirm} disabled={isLoading}>
          {isLoading ? (
            <>
              <CircleNotch aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
              更新中...
            </>
          ) : (
            '立即更新'
          )}
        </Button>
      </div>
    </Modal>
  );
}
