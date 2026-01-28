/**
 * BroadcastListener - 广播监听组件
 *
 * 订阅 SSE 广播事件并显示 toast 通知
 */
import { useCallback } from 'react';
import { useBroadcastSSE, type BroadcastEvent } from '../../hooks/useBroadcastSSE';
import { useToast } from '../ui';
import { BroadcastToast } from './BroadcastToast';

export function BroadcastListener() {
  const toast = useToast();

  const handleBroadcast = useCallback(
    (event: BroadcastEvent) => {
      toast.custom(
        <BroadcastToast title={event.title} content={event.content} priority={event.priority} />,
        {
          duration: event.priority === 'URGENT' ? 10000 : 5000,
        },
      );
    },
    [toast],
  );

  useBroadcastSSE({ onBroadcast: handleBroadcast });

  return null;
}
