import { BookOpen, ArrowRight, ArrowLeft, CheckCircle, CircleNotch } from '../../Icon';

interface WordBook {
  id: string;
  name: string;
  wordCount?: number;
}

interface WordbookStepProps {
  onNext: () => void;
  onBack: () => void;
  selectedWordbookId: string | null;
  onSelectWordbook: (id: string) => void;
}

const PLACEHOLDER_WORDBOOKS: WordBook[] = [
  { id: 'cet4', name: 'CET-4 核心词汇', wordCount: 4500 },
  { id: 'cet6', name: 'CET-6 核心词汇', wordCount: 5500 },
  { id: 'toefl', name: 'TOEFL 词汇', wordCount: 8000 },
  { id: 'ielts', name: 'IELTS 词汇', wordCount: 6000 },
];

export function WordbookStep({
  onNext,
  onBack,
  selectedWordbookId,
  onSelectWordbook,
}: WordbookStepProps) {
  const wordbooks = PLACEHOLDER_WORDBOOKS;
  const isLoading = false;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">选择词书</h2>
        <p className="text-gray-600 dark:text-gray-400">选择一本词书开始您的学习之旅</p>
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <CircleNotch className="text-primary-500 h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {wordbooks.map((book) => (
              <button
                key={book.id}
                onClick={() => onSelectWordbook(book.id)}
                className={`relative flex items-start space-x-4 rounded-xl border p-4 text-left transition-all ${
                  selectedWordbookId === book.id
                    ? 'border-primary-500 bg-primary-50 ring-primary-500 dark:bg-primary-900/20 ring-2'
                    : 'hover:border-primary-300 border-gray-200 bg-white hover:shadow-md dark:border-gray-700 dark:bg-gray-800'
                }`}
              >
                <div
                  className={`rounded-lg p-3 ${
                    selectedWordbookId === book.id
                      ? 'bg-primary-200 dark:bg-primary-800'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  <BookOpen
                    className={`h-6 w-6 ${
                      selectedWordbookId === book.id
                        ? 'text-primary-700 dark:text-primary-300'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{book.name}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {book.wordCount || 0} 个单词
                  </p>
                </div>
                {selectedWordbookId === book.id && (
                  <div className="text-primary-600 dark:text-primary-400 absolute right-4 top-4">
                    <CheckCircle weight="fill" className="h-6 w-6" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-between border-t border-gray-100 pt-6 dark:border-gray-700">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg px-6 py-2.5 font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>
        <button
          onClick={onNext}
          disabled={!selectedWordbookId}
          className="bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 flex items-center gap-2 rounded-lg px-8 py-2.5 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          下一步 <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
