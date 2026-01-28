import { FeatureUpgrading } from '../components/PlannedFeature';

/**
 * BadgeGalleryPage - 成就画廊页面
 * 功能升级中，敬请期待 v1.8.0
 */
export default function BadgeGalleryPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <FeatureUpgrading />
      </div>
    </div>
  );
}
