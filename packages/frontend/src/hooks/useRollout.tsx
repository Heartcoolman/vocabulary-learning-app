/**
 * Rollout Hooks - 灰度发布 React Hooks
 *
 * 提供 Feature Flag、A/B 测试和灰度发布的 React 集成
 */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useContext,
  createContext,
  ReactNode,
  ReactElement,
  isValidElement,
} from 'react';
import {
  FeatureFlag,
  FeatureFlagEvaluation,
  UserContext,
  getFeatureFlagManager,
  FeatureFlagKey,
} from '../utils/featureFlags';
import { RolloutStage, RolloutConfig, getRolloutManager } from '../config/rollout';
import {
  Experiment,
  Variant,
  ExperimentAssignment,
  getABTestingManager,
  ExperimentKey,
} from '../utils/abTesting';

// ===================== Context =====================

interface RolloutContextValue {
  userContext: UserContext | null;
  setUserContext: (context: UserContext) => void;
  isReady: boolean;
}

const RolloutContext = createContext<RolloutContextValue | null>(null);

/**
 * 灰度发布 Provider
 */
export function RolloutProvider({
  children,
  initialUserContext,
  onReady,
}: {
  children: ReactNode;
  initialUserContext?: UserContext;
  onReady?: () => void;
}) {
  const [userContext, setUserContextState] = useState<UserContext | null>(
    initialUserContext || null,
  );
  const [isReady, setIsReady] = useState(false);

  const setUserContext = useCallback((context: UserContext) => {
    setUserContextState(context);

    // 同步到各个管理器
    getFeatureFlagManager().setUserContext(context);
    getRolloutManager().setUserContext(context);
    getABTestingManager().setUserContext(context);
  }, []);

  useEffect(() => {
    if (initialUserContext) {
      setUserContext(initialUserContext);
    }
    setIsReady(true);
    onReady?.();
  }, [initialUserContext, setUserContext, onReady]);

  const value = useMemo(
    () => ({ userContext, setUserContext, isReady }),
    [userContext, setUserContext, isReady],
  );

  return <RolloutContext.Provider value={value}>{children}</RolloutContext.Provider>;
}

/**
 * 获取灰度发布上下文
 */
export function useRolloutContext(): RolloutContextValue {
  const context = useContext(RolloutContext);
  if (!context) {
    throw new Error('useRolloutContext must be used within a RolloutProvider');
  }
  return context;
}

// ===================== Feature Flag Hooks =====================

/**
 * 使用特性开关
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { enabled, loading } = useFeatureFlag('new_dashboard');
 *
 *   if (loading) return <Spinner />;
 *   if (!enabled) return <OldDashboard />;
 *   return <NewDashboard />;
 * }
 * ```
 */
export function useFeatureFlag(flagKey: FeatureFlagKey | string): {
  enabled: boolean;
  loading: boolean;
  evaluation: FeatureFlagEvaluation | null;
  flag: FeatureFlag | undefined;
} {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [evaluation, setEvaluation] = useState<FeatureFlagEvaluation | null>(null);

  useEffect(() => {
    const manager = getFeatureFlagManager();

    // 初始评估
    const result = manager.evaluate(flagKey);
    setEnabled(result.enabled);
    setEvaluation(result);
    setLoading(false);

    // 订阅变更
    const unsubscribe = manager.subscribe(flagKey, (newEnabled) => {
      setEnabled(newEnabled);
      setEvaluation(manager.evaluate(flagKey));
    });

    return unsubscribe;
  }, [flagKey]);

  const flag = useMemo(() => getFeatureFlagManager().getFlag(flagKey), [flagKey]);

  return { enabled, loading, evaluation, flag };
}

/**
 * 使用多个特性开关
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const flags = useFeatureFlags(['dark_mode', 'new_ui', 'beta_features']);
 *
 *   return (
 *     <div className={flags.dark_mode ? 'dark' : 'light'}>
 *       {flags.new_ui ? <NewUI /> : <OldUI />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useFeatureFlags(flagKeys: (FeatureFlagKey | string)[]): Record<string, boolean> {
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const manager = getFeatureFlagManager();

    // 初始评估
    const initialFlags: Record<string, boolean> = {};
    flagKeys.forEach((key) => {
      initialFlags[key] = manager.isEnabled(key);
    });
    setFlags(initialFlags);

    // 订阅所有变更
    const unsubscribes = flagKeys.map((key) =>
      manager.subscribe(key, (enabled) => {
        setFlags((prev) => ({ ...prev, [key]: enabled }));
      }),
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [flagKeys.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return flags;
}

/**
 * 条件渲染组件 - 基于特性开关
 *
 * @example
 * ```tsx
 * <Feature flag="new_feature">
 *   <NewFeatureComponent />
 * </Feature>
 *
 * <Feature flag="beta_ui" fallback={<OldUI />}>
 *   <BetaUI />
 * </Feature>
 * ```
 */
export function Feature({
  flag,
  children,
  fallback = null,
}: {
  flag: FeatureFlagKey | string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { enabled, loading } = useFeatureFlag(flag);

  if (loading) return null;
  return <>{enabled ? children : fallback}</>;
}

// ===================== Experiment Hooks =====================

/**
 * 使用实验
 *
 * @example
 * ```tsx
 * function PricingPage() {
 *   const { variant, isInExperiment, trackConversion } = useExperiment('pricing_experiment');
 *
 *   if (!isInExperiment) return <DefaultPricing />;
 *
 *   const handlePurchase = () => {
 *     trackConversion();
 *     // ... 处理购买
 *   };
 *
 *   return variant?.id === 'variant_a'
 *     ? <PricingA onPurchase={handlePurchase} />
 *     : <PricingB onPurchase={handlePurchase} />;
 * }
 * ```
 */
export function useExperiment(experimentKey: ExperimentKey | string): {
  experiment: Experiment | undefined;
  variant: Variant | null;
  assignment: ExperimentAssignment | null;
  isInExperiment: boolean;
  isControl: boolean;
  config: <T = unknown>(key: string, defaultValue: T) => T;
  trackEvent: (eventName: string, eventValue?: number) => void;
  trackConversion: () => void;
} {
  const [variant, setVariant] = useState<Variant | null>(null);
  const [assignment, setAssignment] = useState<ExperimentAssignment | null>(null);

  useEffect(() => {
    const manager = getABTestingManager();

    // 获取分配
    const currentAssignment = manager.getAssignment(experimentKey);
    setAssignment(currentAssignment);

    if (currentAssignment) {
      const currentVariant = manager.getVariant(experimentKey);
      setVariant(currentVariant);
    }

    // 订阅变更
    const unsubscribe = manager.subscribe(experimentKey, (newAssignment) => {
      setAssignment(newAssignment);
      setVariant(manager.getVariant(experimentKey));
    });

    return unsubscribe;
  }, [experimentKey]);

  const experiment = useMemo(
    () => getABTestingManager().getExperiment(experimentKey),
    [experimentKey],
  );

  const isInExperiment = assignment !== null;
  const isControl = variant?.isControl ?? false;

  const config = useCallback(
    <T = unknown,>(key: string, defaultValue: T): T => {
      return getABTestingManager().getVariantConfig(experimentKey, key, defaultValue);
    },
    [experimentKey],
  );

  const trackEvent = useCallback(
    (eventName: string, eventValue?: number) => {
      getABTestingManager().trackEvent(experimentKey, eventName, eventValue);
    },
    [experimentKey],
  );

  const trackConversion = useCallback(() => {
    getABTestingManager().trackConversion(experimentKey);
  }, [experimentKey]);

  return {
    experiment,
    variant,
    assignment,
    isInExperiment,
    isControl,
    config,
    trackEvent,
    trackConversion,
  };
}

/**
 * 使用实验变体配置
 *
 * @example
 * ```tsx
 * function Button() {
 *   const buttonColor = useExperimentConfig('button_color_test', 'color', 'blue');
 *   return <button style={{ backgroundColor: buttonColor }}>Click me</button>;
 * }
 * ```
 */
export function useExperimentConfig<T = unknown>(
  experimentKey: ExperimentKey | string,
  configKey: string,
  defaultValue: T,
): T {
  const { config } = useExperiment(experimentKey);
  return config(configKey, defaultValue);
}

/**
 * 实验组件 - 根据变体渲染不同内容
 *
 * @example
 * ```tsx
 * <Experiment name="landing_page_test">
 *   <Experiment.Variant name="control">
 *     <OriginalLandingPage />
 *   </Experiment.Variant>
 *   <Experiment.Variant name="variant_a">
 *     <NewLandingPageA />
 *   </Experiment.Variant>
 *   <Experiment.Variant name="variant_b">
 *     <NewLandingPageB />
 *   </Experiment.Variant>
 * </Experiment>
 * ```
 */
export function ExperimentComponent({
  name,
  children,
  fallback = null,
}: {
  name: ExperimentKey | string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { variant, isInExperiment } = useExperiment(name);

  if (!isInExperiment) {
    return <>{fallback}</>;
  }

  // 查找匹配的变体子组件
  const childArray = Array.isArray(children) ? children : [children];
  const matchedChild = childArray.find((child: ReactNode) => {
    if (!isValidElement(child)) return false;
    const props = child.props as { name?: string };
    return props?.name === variant?.id || props?.name === variant?.name;
  });

  return <>{matchedChild || fallback}</>;
}

/**
 * 变体组件
 */
ExperimentComponent.Variant = function VariantComponent({
  name: _name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return <>{children}</>;
};

// 导出别名
export { ExperimentComponent as Experiment };

// ===================== Rollout Stage Hooks =====================

/**
 * 使用发布阶段
 *
 * @example
 * ```tsx
 * function StatusBadge() {
 *   const { stage, isCanary, isBeta } = useRolloutStage('new_feature');
 *
 *   if (isCanary) return <Badge color="yellow">Canary</Badge>;
 *   if (isBeta) return <Badge color="blue">Beta</Badge>;
 *   return null;
 * }
 * ```
 */
export function useRolloutStage(featureKey: string): {
  stage: RolloutStage;
  rollout: RolloutConfig | undefined;
  isCanary: boolean;
  isBeta: boolean;
  isStable: boolean;
  isAllocated: boolean;
} {
  const [stage, setStage] = useState<RolloutStage>('stable');
  const [rollout, setRollout] = useState<RolloutConfig | undefined>();
  const [isAllocated, setIsAllocated] = useState(false);

  useEffect(() => {
    const manager = getRolloutManager();

    const updateStage = () => {
      const currentRollout = manager.getRolloutByFeature(featureKey);
      setRollout(currentRollout);

      if (currentRollout) {
        const allocation = manager.allocateTraffic(currentRollout.id);
        setStage(allocation.stage);
        setIsAllocated(allocation.allocated);
      } else {
        setStage('stable');
        setIsAllocated(false);
      }
    };

    updateStage();

    // 可以添加轮询或事件监听来更新状态
    const interval = setInterval(updateStage, 60000); // 每分钟更新

    return () => clearInterval(interval);
  }, [featureKey]);

  return {
    stage,
    rollout,
    isCanary: stage === 'canary',
    isBeta: stage === 'beta',
    isStable: stage === 'stable',
    isAllocated,
  };
}

/**
 * 使用所有活跃的发布配置
 */
export function useActiveRollouts(): RolloutConfig[] {
  const [rollouts, setRollouts] = useState<RolloutConfig[]>([]);

  useEffect(() => {
    const manager = getRolloutManager();

    const updateRollouts = () => {
      const allRollouts = manager.getAllRollouts();
      const active = allRollouts.filter((r) => r.status === 'in_progress');
      setRollouts(active);
    };

    updateRollouts();
    const interval = setInterval(updateRollouts, 60000);

    return () => clearInterval(interval);
  }, []);

  return rollouts;
}

// ===================== Combined Hooks =====================

/**
 * 组合 Hook - 同时获取特性开关和实验状态
 *
 * @example
 * ```tsx
 * function MyFeature() {
 *   const {
 *     featureEnabled,
 *     experimentVariant,
 *     rolloutStage
 *   } = useFeatureWithExperiment('new_feature', 'new_feature_experiment');
 *
 *   if (!featureEnabled) return null;
 *
 *   // 根据实验变体和发布阶段渲染
 * }
 * ```
 */
export function useFeatureWithExperiment(
  featureKey: FeatureFlagKey | string,
  experimentKey?: ExperimentKey | string,
) {
  const feature = useFeatureFlag(featureKey);
  // Always call useExperiment to follow Rules of Hooks, pass empty string if no key
  const experimentResult = useExperiment(experimentKey || '');
  const experiment = experimentKey ? experimentResult : null;
  const rollout = useRolloutStage(featureKey);

  return {
    // Feature Flag
    featureEnabled: feature.enabled,
    featureLoading: feature.loading,
    featureEvaluation: feature.evaluation,

    // Experiment
    experimentVariant: experiment?.variant,
    isInExperiment: experiment?.isInExperiment ?? false,
    experimentConfig: experiment?.config,
    trackExperimentEvent: experiment?.trackEvent,
    trackExperimentConversion: experiment?.trackConversion,

    // Rollout
    rolloutStage: rollout.stage,
    isCanary: rollout.isCanary,
    isBeta: rollout.isBeta,
    isStable: rollout.isStable,
    isRolloutAllocated: rollout.isAllocated,
  };
}

// ===================== Debug Hooks =====================

/**
 * 调试 Hook - 获取所有灰度发布相关信息
 *
 * @example
 * ```tsx
 * function DebugPanel() {
 *   const debug = useRolloutDebug();
 *   return <pre>{JSON.stringify(debug, null, 2)}</pre>;
 * }
 * ```
 */
export function useRolloutDebug() {
  const [debugInfo, setDebugInfo] = useState<{
    flags: FeatureFlag[];
    experiments: Experiment[];
    rollouts: RolloutConfig[];
    userContext: UserContext | null;
  }>({
    flags: [],
    experiments: [],
    rollouts: [],
    userContext: null,
  });

  useEffect(() => {
    const updateDebugInfo = () => {
      setDebugInfo({
        flags: getFeatureFlagManager().getAllFlags(),
        experiments: getABTestingManager().getAllExperiments(),
        rollouts: getRolloutManager().getAllRollouts(),
        userContext: null, // 从 context 获取
      });
    };

    updateDebugInfo();
    const interval = setInterval(updateDebugInfo, 5000);

    return () => clearInterval(interval);
  }, []);

  return debugInfo;
}
