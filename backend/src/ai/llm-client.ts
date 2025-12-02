/**
 * LLM Client (大语言模型客户端)
 *
 * 支持多种LLM provider的统一调用接口
 */

import { env } from '../config/env';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
  finishReason: 'stop' | 'length' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  baseURL?: string;
}

export class LLMClient {
  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    this.config = {
      provider: (config?.provider as any) || 'openai',
      model: config?.model || 'gpt-4o-mini',
      temperature: config?.temperature ?? 0.7,
      maxTokens: config?.maxTokens ?? 150,
      apiKey: config?.apiKey || process.env.OPENAI_API_KEY,
      baseURL: config?.baseURL
    };
  }

  /**
   * 调用LLM生成内容
   */
  async generate(messages: LLMMessage[]): Promise<LLMResponse> {
    if (this.config.provider === 'openai') {
      return this.generateOpenAI(messages);
    } else if (this.config.provider === 'anthropic') {
      return this.generateAnthropic(messages);
    } else {
      return this.generateLocal(messages);
    }
  }

  /**
   * OpenAI API调用
   */
  private async generateOpenAI(messages: LLMMessage[]): Promise<LLMResponse> {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const baseURL = this.config.baseURL || 'https://api.openai.com/v1';

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    return {
      text: choice?.message?.content || '',
      finishReason: choice?.finish_reason === 'stop' ? 'stop' : 'error',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      }
    };
  }

  /**
   * Anthropic Claude API调用（占位）
   */
  private async generateAnthropic(messages: LLMMessage[]): Promise<LLMResponse> {
    throw new Error('Anthropic provider not yet implemented');
  }

  /**
   * 本地模型调用（占位，可对接Ollama等）
   */
  private async generateLocal(messages: LLMMessage[]): Promise<LLMResponse> {
    throw new Error('Local provider not yet implemented');
  }

  /**
   * 快捷方法：单轮对话
   */
  async generateSingle(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.generate([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    return response.text;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }
}

// 默认实例（使用环境变量配置）
export const defaultLLMClient = new LLMClient();
