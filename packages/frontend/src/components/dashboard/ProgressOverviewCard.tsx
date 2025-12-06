import { Trophy, Target, BookOpen } from '../../components/Icon';
import { StudyProgressData } from '../../hooks/useStudyProgress';

interface ProgressOverviewCardProps {
  data: StudyProgressData;
}

export const ProgressOverviewCard = ({ data }: ProgressOverviewCardProps) => {
  const { todayStudied, todayTarget, totalStudied, correctRate } = data;

  const percentComplete = Math.min(100, todayTarget > 0 ? Math.round((todayStudied / todayTarget) * 100) : 0);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentComplete / 100) * circumference;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
        <div className="col-span-1 flex flex-col items-center justify-center relative">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke="#F3F4F6"
                strokeWidth="12"
                fill="transparent"
              />
              <circle
                cx="80"
                cy="80"
                r={radius}
                stroke="#3B82F6"
                strokeWidth="12"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-bold text-gray-900">{todayStudied}</span>
              <span className="text-xs text-gray-500 font-medium uppercase">/ {todayTarget}</span>
            </div>
          </div>
          <div className="mt-4 text-center">
            <h3 className="font-bold text-gray-900 flex items-center justify-center gap-2">
              <Target className="w-4 h-4 text-blue-500" weight="bold" />
              今日目标
            </h3>
            <p className="text-sm text-gray-500">
              {percentComplete >= 100 ? '太棒了，已完成！' : '继续加油！'}
            </p>
          </div>
        </div>

        <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4">
          <div className="bg-indigo-50 rounded-xl p-6 flex flex-col justify-between h-32 border border-indigo-100 group hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <BookOpen className="w-5 h-5 text-indigo-600" weight="bold" />
              </div>
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">累计</span>
            </div>
            <div>
              <span className="text-3xl font-bold text-gray-900">{totalStudied.toLocaleString()}</span>
              <p className="text-sm text-indigo-600/80 font-medium mt-1">已学单词</p>
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl p-6 flex flex-col justify-between h-32 border border-amber-100 group hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Trophy className="w-5 h-5 text-amber-600" weight="bold" />
              </div>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">准确率</span>
            </div>
            <div>
              <span className="text-3xl font-bold text-gray-900">{correctRate}%</span>
              <p className="text-sm text-amber-600/80 font-medium mt-1">答题正确率</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
