import React from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import AmasStatus from './AmasStatus';

interface StatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  refreshTrigger?: number;
}

const StatusModalComponent = ({ isOpen, onClose, refreshTrigger = 0 }: StatusModalProps) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="学习状态监控" maxWidth="md">
      <div className="space-y-6">
        <AmasStatus detailed={true} refreshTrigger={refreshTrigger} />

        <div className="flex justify-end">
          <Button onClick={onClose} variant="primary">
            关闭
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/**
 * Memoized StatusModal component
 * Only re-renders when isOpen, onClose function, or refreshTrigger changes
 */
const StatusModal = React.memo(StatusModalComponent, (prevProps, nextProps) => {
  return (
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.onClose === nextProps.onClose &&
    prevProps.refreshTrigger === nextProps.refreshTrigger
  );
});

export default StatusModal;
