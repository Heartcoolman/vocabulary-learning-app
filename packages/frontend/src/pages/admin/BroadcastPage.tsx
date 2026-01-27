import { useState } from 'react';
import { Bell, Clock, FileText, Lightning } from '../../components/Icon';
import { Tabs, TabsList, Tab, TabsPanel, Modal } from '../../components/ui';
import BroadcastForm from '../../components/admin/broadcast/BroadcastForm';
import BroadcastList from '../../components/admin/broadcast/BroadcastList';
import BroadcastDetail from '../../components/admin/broadcast/BroadcastDetail';
import OnlineStats from '../../components/admin/broadcast/OnlineStats';

export default function BroadcastPage() {
  const [activeTab, setActiveTab] = useState('broadcasts');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="animate-g3-fade-in space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-button bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <Bell size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">广播管理</h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              向用户发送通知和管理广播记录
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onChange={setActiveTab} variant="line">
        <TabsList className="gap-2">
          <Tab value="broadcasts" icon={<FileText size={16} />}>
            广播列表
          </Tab>
          <Tab value="create" icon={<Lightning size={16} />}>
            创建广播
          </Tab>
          <Tab value="stats" icon={<Clock size={16} />}>
            在线统计
          </Tab>
        </TabsList>

        <TabsPanel value="broadcasts" className="pt-6">
          <BroadcastList selectedId={selectedId} onSelect={setSelectedId} />
        </TabsPanel>

        <TabsPanel value="create" className="pt-6">
          <BroadcastForm onCreated={() => setActiveTab('broadcasts')} />
        </TabsPanel>

        <TabsPanel value="stats" className="pt-6">
          <OnlineStats />
        </TabsPanel>
      </Tabs>

      <Modal
        isOpen={!!selectedId}
        onClose={() => setSelectedId(null)}
        title="广播详情"
        maxWidth="lg"
      >
        <BroadcastDetail broadcastId={selectedId} />
      </Modal>
    </div>
  );
}
