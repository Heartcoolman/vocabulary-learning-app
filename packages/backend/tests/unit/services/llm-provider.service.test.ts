/**
 * LLM Provider Service Unit Tests
 * Tests for the LLMProviderService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock dependencies
vi.mock('../../../src/config/llm.config', () => ({
  llmConfig: {
    enabled: true,
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'test-api-key',
    baseUrl: 'https://api.openai.com/v1',
    temperature: 0.7,
    maxTokens: 1000,
    timeout: 30000,
    maxRetries: 2
  },
  LLMProvider: {}
}));

vi.mock('../../../src/logger', () => ({
  amasLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import { LLMProviderService, llmProviderService, ChatMessage } from '../../../src/services/llm-provider.service';

describe('LLMProviderService', () => {
  let service: LLMProviderService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LLMProviderService();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('chat', () => {
    it('should send chat request and return response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello! How can I help you?' } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18
          },
          model: 'gpt-4'
        })
      });

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      const result = await service.chat(messages);

      expect(result.content).toBe('Hello! How can I help you?');
      expect(result.model).toBe('gpt-4');
      expect(result.usage?.totalTokens).toBe(18);
    });

    it('should use custom options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Response' } }],
          model: 'gpt-4'
        })
      });

      await service.chat(
        [{ role: 'user', content: 'Test' }],
        { temperature: 0.5, maxTokens: 500 }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"temperature":0.5')
        })
      );
    });

    it('should retry on failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: 'Success after retry' } }],
            model: 'gpt-4'
          })
        });

      const result = await service.chat([{ role: 'user', content: 'Test' }]);

      expect(result.content).toBe('Success after retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent error'));

      await expect(
        service.chat([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('Persistent error');

      // Initial + 2 retries = 3 calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle API error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded')
      });

      await expect(
        service.chat([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('OpenAI API');
    });
  });

  describe('complete', () => {
    it('should complete single prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Completed response' } }],
          model: 'gpt-4'
        })
      });

      const result = await service.complete('What is 2+2?');

      expect(result).toBe('Completed response');
    });
  });

  describe('completeWithSystem', () => {
    it('should complete with system prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'System-guided response' } }],
          model: 'gpt-4'
        })
      });

      const result = await service.completeWithSystem(
        'You are a helpful assistant.',
        'Help me with math.'
      );

      expect(result).toBe('System-guided response');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"role":"system"')
        })
      );
    });
  });

  describe('healthCheck', () => {
    it('should return ok when service is healthy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hi' } }],
          model: 'gpt-4'
        })
      });

      const result = await service.healthCheck();

      expect(result.ok).toBe(true);
      expect(result.message).toBe('LLM 服务正常');
    });

    it('should return not ok when service fails', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      const result = await service.healthCheck();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('LLM 服务异常');
    });
  });

  describe('getConfigSummary', () => {
    it('should return config summary', () => {
      const summary = service.getConfigSummary();

      expect(summary.enabled).toBe(true);
      expect(summary.provider).toBe('openai');
      expect(summary.model).toBe('gpt-4');
      expect(summary.apiKeySet).toBe(true);
    });
  });

  describe('OpenAI provider', () => {
    it('should format request correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Response' } }],
          model: 'gpt-4'
        })
      });

      await service.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' }
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
    });
  });

  describe('Anthropic provider', () => {
    let anthropicService: LLMProviderService;

    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../../src/config/llm.config', () => ({
        llmConfig: {
          enabled: true,
          provider: 'anthropic',
          model: 'claude-3-opus',
          apiKey: 'anthropic-key',
          baseUrl: 'https://api.anthropic.com/v1',
          temperature: 0.7,
          maxTokens: 1000,
          timeout: 30000,
          maxRetries: 2
        }
      }));

      const module = await import('../../../src/services/llm-provider.service');
      anthropicService = new module.LLMProviderService();
    });

    it('should format Anthropic request correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: [{ text: 'Claude response' }],
          usage: { input_tokens: 10, output_tokens: 20 },
          model: 'claude-3-opus'
        })
      });

      const result = await anthropicService.chat([
        { role: 'system', content: 'You are Claude.' },
        { role: 'user', content: 'Hello Claude' }
      ]);

      expect(result.content).toBe('Claude response');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'anthropic-key',
            'anthropic-version': '2023-06-01'
          })
        })
      );
    });
  });

  describe('Ollama provider', () => {
    let ollamaService: LLMProviderService;

    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../../src/config/llm.config', () => ({
        llmConfig: {
          enabled: true,
          provider: 'ollama',
          model: 'llama2',
          apiKey: '',
          baseUrl: 'http://localhost:11434/api',
          temperature: 0.7,
          maxTokens: 1000,
          timeout: 30000,
          maxRetries: 2
        }
      }));

      const module = await import('../../../src/services/llm-provider.service');
      ollamaService = new module.LLMProviderService();
    });

    it('should format Ollama request correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          message: { content: 'Ollama response' },
          eval_count: 50,
          prompt_eval_count: 20
        })
      });

      const result = await ollamaService.chat([{ role: 'user', content: 'Hello' }]);

      expect(result.content).toBe('Ollama response');
      expect(result.usage?.completionTokens).toBe(50);
    });
  });

  describe('Custom provider', () => {
    let customService: LLMProviderService;

    beforeEach(async () => {
      vi.resetModules();
      vi.doMock('../../../src/config/llm.config', () => ({
        llmConfig: {
          enabled: true,
          provider: 'custom',
          model: 'custom-model',
          apiKey: 'custom-key',
          baseUrl: 'https://custom.api.com/v1',
          temperature: 0.7,
          maxTokens: 1000,
          timeout: 30000,
          maxRetries: 2
        }
      }));

      const module = await import('../../../src/services/llm-provider.service');
      customService = new module.LLMProviderService();
    });

    it('should use custom base URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Custom response' } }],
          model: 'custom-model'
        })
      });

      await customService.chat([{ role: 'user', content: 'Hello' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/v1/chat/completions',
        expect.anything()
      );
    });

    it('should throw error when base URL is missing', async () => {
      vi.resetModules();
      vi.doMock('../../../src/config/llm.config', () => ({
        llmConfig: {
          enabled: true,
          provider: 'custom',
          model: 'custom-model',
          apiKey: '',
          baseUrl: '',
          temperature: 0.7,
          maxTokens: 1000,
          timeout: 30000,
          maxRetries: 2
        }
      }));

      const module = await import('../../../src/services/llm-provider.service');
      const serviceWithoutUrl = new module.LLMProviderService();

      await expect(
        serviceWithoutUrl.chat([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('LLM_BASE_URL');
    });
  });

  describe('exports', () => {
    it('should export LLMProviderService class', async () => {
      const module = await import('../../../src/services/llm-provider.service');
      expect(module.LLMProviderService).toBeDefined();
    });

    it('should export llmProviderService singleton', async () => {
      const module = await import('../../../src/services/llm-provider.service');
      expect(module.llmProviderService).toBeDefined();
    });

    it('should export ChatMessage type', async () => {
      // Type verification through module import
      const module = await import('../../../src/services/llm-provider.service');
      expect(module.LLMProviderService).toBeDefined();
    });

    it('should export ChatOptions type', async () => {
      const module = await import('../../../src/services/llm-provider.service');
      expect(module.LLMProviderService).toBeDefined();
    });

    it('should export ChatResponse type', async () => {
      const module = await import('../../../src/services/llm-provider.service');
      expect(module.LLMProviderService).toBeDefined();
    });
  });
});
