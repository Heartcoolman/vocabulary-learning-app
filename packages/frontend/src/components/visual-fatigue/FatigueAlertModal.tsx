import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { WarningCircle, Coffee, Bed } from '../Icon';

interface FatigueAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  fatigueLevel: number;
  recommendations: string[];
}

export function FatigueAlertModal({
  isOpen,
  onClose,
  fatigueLevel,
  recommendations,
}: FatigueAlertModalProps) {
  const getSeverity = (level: number) => {
    if (level < 30) return { label: '轻微', color: 'text-green-600', bg: 'bg-green-50' };
    if (level < 60) return { label: '中度', color: 'text-yellow-600', bg: 'bg-yellow-50' };
    if (level < 85) return { label: '高度', color: 'text-orange-600', bg: 'bg-orange-50' };
    return { label: '严重', color: 'text-red-600', bg: 'bg-red-50' };
  };

  const severity = getSeverity(fatigueLevel);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="疲劳提醒">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className={`rounded-full p-4 ${severity.bg}`}>
          <WarningCircle size={48} className={severity.color} weight="fill" />
        </div>

        <div>
          <h3 className="text-xl font-bold text-gray-900">
            检测到您当前疲劳度：
            <span className={`ml-1 ${severity.color}`}>
              {severity.label} ({fatigueLevel})
            </span>
          </h3>
          <p className="mt-2 text-gray-500">为了保证学习效率和用眼健康，建议您适当休息。</p>
        </div>

        {recommendations.length > 0 && (
          <div className="w-full rounded-lg bg-gray-50 p-4 text-left">
            <p className="mb-2 font-medium text-gray-700">建议：</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
              {recommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex w-full gap-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            <Coffee size={20} weight="duotone" className="mr-2" />
            小憩5分钟
          </Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>
            <Bed size={20} weight="duotone" className="mr-2" />
            立即休息
          </Button>
        </div>
      </div>
    </Modal>
  );
}
