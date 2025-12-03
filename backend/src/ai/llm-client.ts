/**
 * LLM Client (大语言模型客户端)
 *
 * 支持多种LLM provider的统一调用接口
 *
 * **当前支持状态：**
 * - ✅ OpenAI (已完整实现)
 * - ⚠️ Anthropic (未实现，配置后会抛出错误)
 * - ⚠️ Local (未实现，配置后会抛出错误)
 *
 * **推荐配置：**
 * 在 .env 文件中设置：
 * ```
 * LLM_PROVIDER=openai
 * OPENAI_API_KEY=your-api-key
 * ```
 *
 * @todo 实现 Anthropic provider (参考 https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
 * @todo 实现 Local provider (可对接 Ollama、LM Studio 等本地模型服务)
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

    // 配置验证：如果使用未实现的provider，立即警告
    if (this.config.provider === 'anthropic') {
      console.warn(
        '⚠️  警告：Anthropic provider 尚未实现。' +
        '调用 generate() 时会抛出错误。' +
        '请在 .env 中设置 LLM_PROVIDER=openai'
      );
    } else if (this.config.provider === 'local') {
      console.warn(
        '⚠️  警告：Local provider 尚未实现。' +
        '调用 generate() 时会抛出错误。' +
        '请在 .env 中设置 LLM_PROVIDER=openai'
      );
    }
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
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      error?: { message?: string };
    };
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
   * Anthropic Claude API调用（占位实现）
   *
   * @todo 实现此方法以支持 Anthropic Claude
   * @throws {Error} 当前版本未实现，抛出明确的错误消息
   *
   * 实现指南：
   * 1. 安装 @anthropic-ai/sdk: npm install @anthropic-ai/sdk
   * 2. 在 .env 中配置 ANTHROPIC_API_KEY
   * 3. 参考 OpenAI 实现，调用 Anthropic API
   * 4. 文档: https://docs.anthropic.com/claude/reference/messages_post
   */
  private async generateAnthropic(_messages: LLMMessage[]): Promise<LLMResponse> {
    throw new Error(
      '❌ Anthropic provider 尚未实现\n\n' +
      '当前仅支持 OpenAI provider。\n\n' +
      '修复方法：\n' +
      '1. 在 .env 文件中设置: LLM_PROVIDER=openai\n' +
      '2. 配置 OPENAI_API_KEY=your-key\n' +
      '3. 重启应用\n\n' +
      '如需 Anthropic 支持，请联系开发团队或查看 backend/src/ai/llm-client.ts 中的 @todo 注释。'
    );
  }

  /**
   * 本地模型调用（占位实现）
   *
   * @todo 实现此方法以对接本地 LLM 服务（如 Ollama、LM Studio）
   * @throws {Error} 当前版本未实现，抛出明确的错误消息
   *
   * 实现指南：
   * 1. 选择本地模型服务（推荐 Ollama: https://ollama.ai）
   * 2. 在 .env 中配置 LOCAL_LLM_BASE_URL（如 http://localhost:11434）
   * 3. 参考 OpenAI 实现，调用兼容 OpenAI 格式的本地API
   * 4. 测试并验证响应格式兼容性
   */
  private async generateLocal(_messages: LLMMessage[]): Promise<LLMResponse> {
    throw new Error(
      '❌ Local provider 尚未实现\n\n' +
      '当前仅支持 OpenAI provider。\n\n' +
      '修复方法：\n' +
      '1. 在 .env 文件中设置: LLM_PROVIDER=openai\n' +
      '2. 配置 OPENAI_API_KEY=your-key\n' +
      '3. 重启应用\n\n' +
      '如需本地模型支持（Ollama/LM Studio），请联系开发团队或查看 backend/src/ai/llm-client.ts 中的 @todo 注释。'
    );
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
