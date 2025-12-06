/**
 * AMAS Engine - 持久化管理模块
 *
 * 负责用户状态和模型的持久化逻辑：
 * - 加载/保存用户状态
 * - 加载/保存 Bandit 模型
 *
 * 设计特性：
 * - 接口抽象（便于测试和替换实现）
 * - 依赖注入（通过构造函数注入存储仓库）
 * - 类型安全（明确的类型定义）
 */

import { LinUCB } from '../learning/linucb';
import { EnsembleLearningFramework } from '../decision/ensemble';
import {
  BanditModel,
  UserState
} from '../types';
import {
  ColdStartStateData,
  DecisionModel,
  Logger,
  ModelRepository,
  StateRepository
} from './engine-types';

/**
 * 持久化管理器接口
 *
 * 定义状态和模型的持久化操作
 */
export interface PersistenceManager {
  /**
   * 加载用户状态
   * @param userId 用户ID
   * @returns 用户状态，如果不存在则返回 null
   */
  loadState(userId: string): Promise<UserState | null>;

  /**
   * 保存用户状态
   * @param userId 用户ID
   * @param state 用户状态
   * @param coldStartState 冷启动状态（可选）
   */
  saveState(
    userId: string,
    state: UserState,
    coldStartState?: ColdStartStateData
  ): Promise<void>;

  /**
   * 加载模型并设置到决策模型实例
   * @param userId 用户ID
   * @param bandit 决策模型实例
   */
  loadModelIfExists(userId: string, bandit: DecisionModel): Promise<void>;

  /**
   * 保存决策模型
   * @param userId 用户ID
   * @param bandit 决策模型实例
   */
  saveModel(userId: string, bandit: DecisionModel): Promise<void>;
}

/**
 * 默认持久化管理器实现
 *
 * 使用 StateRepository 和 ModelRepository 进行持久化
 */
export class DefaultPersistenceManager implements PersistenceManager {
  constructor(
    private stateRepo: StateRepository,
    private modelRepo: ModelRepository,
    private logger?: Logger
  ) {}

  /**
   * 加载用户状态
   */
  async loadState(userId: string): Promise<UserState | null> {
    return this.stateRepo.loadState(userId);
  }

  /**
   * 保存用户状态
   */
  async saveState(
    userId: string,
    state: UserState,
    coldStartState?: ColdStartStateData
  ): Promise<void> {
    await this.stateRepo.saveState(userId, { ...state, coldStartState } as UserState);
  }

  /**
   * 加载模型并设置到决策模型实例
   */
  async loadModelIfExists(userId: string, bandit: DecisionModel): Promise<void> {
    const model = await this.modelRepo.loadModel(userId);
    if (!model) return;

    if (bandit instanceof LinUCB) {
      bandit.setModel(model);
    } else if (bandit instanceof EnsembleLearningFramework) {
      const currentState = bandit.getState();
      bandit.setState({
        ...currentState,
        linucb: model
      });
    }
  }

  /**
   * 保存决策模型
   */
  async saveModel(userId: string, bandit: DecisionModel): Promise<void> {
    let model: BanditModel;

    if (bandit instanceof EnsembleLearningFramework) {
      model = bandit.getState().linucb;
    } else if (bandit instanceof LinUCB) {
      model = bandit.getModel();
    } else {
      // ThompsonSampling 等其他模型暂不支持持久化
      return;
    }

    await this.modelRepo.saveModel(userId, model);
  }
}
