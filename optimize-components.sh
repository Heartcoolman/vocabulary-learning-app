#!/bin/bash

# 批量为React组件添加 React.memo 优化的脚本

# 要优化的组件列表
COMPONENTS=(
  "packages/frontend/src/components/Navigation.tsx"
  "packages/frontend/src/components/SyncIndicator.tsx"
  "packages/frontend/src/components/DecisionTooltip.tsx"
  "packages/frontend/src/components/word-mastery/MasteryWordItem.tsx"
  "packages/frontend/src/components/dashboard/DailyMissionCard.tsx"
  "packages/frontend/src/components/dashboard/ProgressOverviewCard.tsx"
  "packages/frontend/src/components/LineChart.tsx"
  "packages/frontend/src/components/ProgressBarChart.tsx"
  "packages/frontend/src/components/BadgeCelebration.tsx"
  "packages/frontend/src/components/LearningModeSelector.tsx"
  "packages/frontend/src/components/FileUpload.tsx"
  "packages/frontend/src/components/StatusModal.tsx"
  "packages/frontend/src/components/ChronotypeCard.tsx"
)

echo "开始为组件添加 React.memo 优化..."

for component in "${COMPONENTS[@]}"; do
  file="/home/liji/danci/danci/$component"

  if [ ! -f "$file" ]; then
    echo "警告: 文件不存在 $file"
    continue
  fi

  echo "处理: $component"

  # 检查是否已经有memo导入
  if ! grep -q "import.*memo" "$file"; then
    # 添加memo到React导入
    sed -i "s/import { \(.*\) } from 'react'/import { \1, memo } from 'react'/g" "$file"
    sed -i "s/import \(.*\) from 'react'/import \1, { memo } from 'react'/g" "$file"
  fi

done

echo "组件优化标记完成！"
