import { useState } from 'react';
import { WelcomeStep } from './steps/WelcomeStep';
import { WordbookStep } from './steps/WordbookStep';
import { FeaturesStep } from './steps/FeaturesStep';
import { OfflineStep } from './steps/OfflineStep';
import { isTauriEnvironment } from '../../utils/tauri-bridge';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEPS = ['welcome', 'wordbook', 'features', 'offline'] as const;

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedWordbookId, setSelectedWordbookId] = useState<string | null>(null);

  const handleNext = async () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      if (isTauriEnvironment()) {
        try {
          localStorage.setItem('danci.desktop.onboarding_completed', 'true');
        } catch (error) {
          console.error('Failed to save onboarding status:', error);
        }
      }
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep onNext={handleNext} />;
      case 1:
        return (
          <WordbookStep
            onNext={handleNext}
            onBack={handleBack}
            selectedWordbookId={selectedWordbookId}
            onSelectWordbook={setSelectedWordbookId}
          />
        );
      case 2:
        return <FeaturesStep onNext={handleNext} onBack={handleBack} />;
      case 3:
        return <OfflineStep onNext={handleNext} onBack={handleBack} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/90 backdrop-blur-sm">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex h-[600px] flex-col">
          <div className="flex h-2 w-full bg-gray-200 dark:bg-gray-700">
            <div
              className="bg-primary-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-8">{renderStep()}</div>
        </div>
      </div>
    </div>
  );
}
