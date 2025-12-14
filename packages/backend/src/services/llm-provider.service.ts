/**
 * LLM Provider Service
 * LLM 提供者服务
 *
 * 统一的 LLM 调用抽象层，支持多种 LLM 提供者
 */

import { llmConfig, LLMConfig, LLMProvider } from '../config/llm.config';
import { amasLogger } from '../logger';

// ==================== 类型定义 ====================

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 聊天请求选项
 */
export interface ChatOptions {
  /** 温度参数 */
  temperature?: number;
  /** 最大输出 token */
  maxTokens?: number;
  /** 超时（毫秒） */
  timeout?: number;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  /** 响应内容 */
  content: string;
  /** 使用的 token 数 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 模型名称 */
  model: string;
}

/**
 * LLM 提供者接口
 */
interface ILLMProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}

// ==================== 提供者实现 ====================

/**
 * OpenAI 提供者
 */
class OpenAIProvider implements ILLMProvider {
  constructor(private config: LLMConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: options?.temperature ?? this.config.temperature,
        max_tokens: options?.maxTokens ?? this.config.maxTokens,
      }),
      signal: AbortSignal.timeout(options?.timeout ?? this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API 错误 (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };
    return {
      content: data.choices[0].message.content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      model: data.model,
    };
  }
}

/**
 * Anthropic 提供者
 */
class AnthropicProvider implements ILLMProvider {
  constructor(private config: LLMConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    // 提取 system 消息
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch(`${this.config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: options?.maxTokens ?? this.config.maxTokens,
        system: systemMessage?.content,
        messages: userMessages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        temperature: options?.temperature ?? this.config.temperature,
      }),
      signal: AbortSignal.timeout(options?.timeout ?? this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API 错误 (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      content: Array<{ text: string }>;
      usage?: { input_tokens: number; output_tokens: number };
      model: string;
    };
    return {
      content: data.content[0].text,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
      model: data.model,
    };
  }
}

/**
 * Ollama 提供者（本地部署）
 */
class OllamaProvider implements ILLMProvider {
  constructor(private config: LLMConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? this.config.temperature,
          num_predict: options?.maxTokens ?? this.config.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(options?.timeout ?? this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API 错误 (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      message: { content: string };
      eval_count?: number;
      prompt_eval_count?: number;
    };
    return {
      content: data.message.content,
      usage: data.eval_count
        ? {
            promptTokens: data.prompt_eval_count || 0,
            completionTokens: data.eval_count,
            totalTokens: (data.prompt_eval_count || 0) + data.eval_count,
          }
        : undefined,
      model: this.config.model,
    };
  }
}

/**
 * 自定义提供者（兼容 OpenAI 格式）
 */
class CustomProvider implements ILLMProvider {
  constructor(private config: LLMConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.config.baseUrl) {
      throw new Error('自定义提供者需要设置 LLM_BASE_URL');
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: options?.temperature ?? this.config.temperature,
        max_tokens: options?.maxTokens ?? this.config.maxTokens,
      }),
      signal: AbortSignal.timeout(options?.timeout ?? this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom API 错误 (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model?: string;
    };
    return {
      content: data.choices[0].message.content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      model: data.model || this.config.model,
    };
  }
}

// ==================== 服务类 ====================

/**
 * LLM 提供者服务
 *
 * 统一封装多种 LLM 提供者，提供重试和错误处理
 */
export class LLMProviderService {
  private provider: ILLMProvider;
  private config: LLMConfig;
  private isConfigValid: boolean;

  constructor(config?: LLMConfig) {
    this.config = config ?? llmConfig;

    // 验证配置完整性
    this.isConfigValid = this.validateConfig();

    if (!this.isConfigValid) {
      amasLogger.warn(
        {
          enabled: this.config.enabled,
          provider: this.config.provider,
          apiKeySet: !!this.config.apiKey,
        },
        '[LLMProvider] 配置不完整，LLM 功能将不可用',
      );
    }

    this.provider = this.createProvider(this.config.provider);
  }

  /**
   * 验证 LLM 配置是否完整
   */
  private validateConfig(): boolean {
    // 如果未启用，不需要验证
    if (!this.config.enabled) {
      return false;
    }

    // Ollama 不需要 API Key
    if (this.config.provider === 'ollama') {
      return !!this.config.baseUrl;
    }

    // 其他提供者需要 API Key
    if (!this.config.apiKey) {
      return false;
    }

    return true;
  }

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    return this.config.enabled && this.isConfigValid;
  }

  /**
   * 创建对应的提供者实例
   */
  private createProvider(type: LLMProvider): ILLMProvider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider(this.config);
      case 'anthropic':
        return new AnthropicProvider(this.config);
      case 'ollama':
        return new OllamaProvider(this.config);
      case 'custom':
        return new CustomProvider(this.config);
      default:
        throw new Error(`不支持的 LLM 提供者: ${type}`);
    }
  }

  /**
   * 发送聊天请求（带重试）
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    // 前置检查：服务是否可用
    if (!this.config.enabled) {
      throw new Error('LLM 服务未启用');
    }

    if (!this.isConfigValid) {
      throw new Error('LLM 配置不完整，请检查 API Key 或 Base URL 设置');
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const response = await this.provider.chat(messages, options);
        const duration = Date.now() - startTime;

        amasLogger.info(
          {
            provider: this.config.provider,
            model: response.model,
            duration,
            usage: response.usage,
          },
          '[LLMProvider] 调用成功',
        );

        return response;
      } catch (error) {
        lastError = error as Error;
        amasLogger.warn(
          {
            provider: this.config.provider,
            attempt: attempt + 1,
            maxRetries: this.config.maxRetries,
            error: lastError.message,
          },
          '[LLMProvider] 调用失败，准备重试',
        );

        if (attempt < this.config.maxRetries) {
          // 指数退避
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError;
  }

  /**
   * 简化的单轮对话
   */
  async complete(prompt: string, options?: ChatOptions): Promise<string> {
    const response = await this.chat([{ role: 'user', content: prompt }], options);
    return response.content;
  }

  /**
   * 带系统提示的对话
   */
  async completeWithSystem(
    systemPrompt: string,
    userPrompt: string,
    options?: ChatOptions,
  ): Promise<string> {
    const response = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options,
    );
    return response.content;
  }

  /**
   * 检查服务是否可用
   */
  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.complete('Hello', { maxTokens: 10, timeout: 10000 });
      return { ok: true, message: 'LLM 服务正常' };
    } catch (error) {
      return {
        ok: false,
        message: `LLM 服务异常: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 获取当前配置摘要
   */
  getConfigSummary(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      provider: this.config.provider,
      model: this.config.model,
      baseUrl: this.config.baseUrl,
      apiKeySet: !!this.config.apiKey,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ==================== 默认实例 ====================

/** 默认 LLM 提供者服务实例 */
export const llmProviderService = new LLMProviderService();
