import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useSystemWordBooks,
  useUserWordBooks,
  useAllAvailableWordBooks,
  useWordBook,
  useWordBookWords,
  useSearchWords,
} from '../queries/useWordBooks';
import type { WordBook, Word } from '../../types/models';

// Mock apiClient
const mockSystemBooks: WordBook[] = [
  {
    id: 'system-book-1',
    name: 'CET-4 词汇',
    description: '大学英语四级核心词汇',
    wordCount: 4500,
    type: 'SYSTEM',
    isPublic: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const mockUserBooks: WordBook[] = [
  {
    id: 'user-book-1',
    name: '我的生词本',
    description: '平时积累的生词',
    wordCount: 150,
    type: 'USER',
    isPublic: false,
    userId: 'user-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const mockWords: Word[] = [
  {
    id: 'word-1',
    spelling: 'apple',
    phonetic: '/ˈæp.əl/',
    meanings: ['n. 苹果'],
    examples: ['I like apples.'],
    wordBookId: 'system-book-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    getSystemWordBooks: vi.fn(),
    getUserWordBooks: vi.fn(),
    getAllAvailableWordBooks: vi.fn(),
    getWordBookById: vi.fn(),
    getWordBookWords: vi.fn(),
    searchWords: vi.fn(),
  },
}));

vi.mock('../../services/client', () => ({
  apiClient: mockApiClient,
  default: mockApiClient,
}));

import { apiClient } from '../../services/client';

describe('useWordBooks', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('useSystemWordBooks', () => {
    it('should fetch system word books successfully', async () => {
      (apiClient.getSystemWordBooks as any).mockResolvedValue(mockSystemBooks);

      const { result } = renderHook(() => useSystemWordBooks(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockSystemBooks);
      expect(apiClient.getSystemWordBooks).toHaveBeenCalledTimes(1);
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch');
      (apiClient.getSystemWordBooks as any).mockRejectedValue(error);

      const { result } = renderHook(() => useSystemWordBooks(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(error);
    });
  });

  describe('useUserWordBooks', () => {
    it('should fetch user word books successfully', async () => {
      (apiClient.getUserWordBooks as any).mockResolvedValue(mockUserBooks);

      const { result } = renderHook(() => useUserWordBooks(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockUserBooks);
      expect(apiClient.getUserWordBooks).toHaveBeenCalledTimes(1);
    });
  });

  describe('useAllAvailableWordBooks', () => {
    it('should fetch all available word books', async () => {
      const allBooks = [...mockSystemBooks, ...mockUserBooks];
      (apiClient.getAllAvailableWordBooks as any).mockResolvedValue(allBooks);

      const { result } = renderHook(() => useAllAvailableWordBooks(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(allBooks);
    });
  });

  describe('useWordBook', () => {
    it('should fetch single word book', async () => {
      (apiClient.getWordBookById as any).mockResolvedValue(mockSystemBooks[0]);

      const { result } = renderHook(() => useWordBook('system-book-1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockSystemBooks[0]);
      expect(apiClient.getWordBookById).toHaveBeenCalledWith('system-book-1');
    });

    it('should not fetch if id is empty', () => {
      const { result } = renderHook(() => useWordBook(''), { wrapper });

      expect(result.current.fetchStatus).toBe('idle');
      expect(apiClient.getWordBookById).not.toHaveBeenCalled();
    });
  });

  describe('useWordBookWords', () => {
    it('should fetch words from word book', async () => {
      (apiClient.getWordBookWords as any).mockResolvedValue(mockWords);

      const { result } = renderHook(() => useWordBookWords('system-book-1'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockWords);
      expect(apiClient.getWordBookWords).toHaveBeenCalledWith('system-book-1');
    });
  });

  describe('useSearchWords', () => {
    it('should search words', async () => {
      const searchResults = mockWords;
      (apiClient.searchWords as any).mockResolvedValue(searchResults);

      const { result } = renderHook(() => useSearchWords('apple', 20), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(searchResults);
      expect(apiClient.searchWords).toHaveBeenCalledWith('apple', 20);
    });

    it('should not search if query is empty', () => {
      const { result } = renderHook(() => useSearchWords('', 20), { wrapper });

      expect(result.current.fetchStatus).toBe('idle');
      expect(apiClient.searchWords).not.toHaveBeenCalled();
    });
  });
});
