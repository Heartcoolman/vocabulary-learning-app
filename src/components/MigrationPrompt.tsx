interface MigrationPromptProps {
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * MigrationPrompt - ???????????????
 */
export default function MigrationPrompt({ onComplete, onSkip }: MigrationPromptProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-g3-fade-in">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md mx-4">
        <div className="text-center mb-6">
          <div className="text-blue-500 text-5xl mb-4" aria-hidden="true">??</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">??????</h2>
          <p className="text-gray-600">
            ??????????????????????????????
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={onComplete}
            className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            ????
          </button>
          <button
            onClick={onSkip}
            className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200 hover:scale-105 active:scale-95 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            ??
          </button>
        </div>
      </div>
    </div>
  );
}
