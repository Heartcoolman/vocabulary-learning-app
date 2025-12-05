/**
 * VocabularyPage Tests
 */

import { describe, it, vi, beforeEach } from 'vitest';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user', username: 'Test User' },
    isAuthenticated: true,
  }),
}));

vi.mock('@/services/ApiClient', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

describe('VocabularyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it.todo('should render page structure');
  });

  describe('wordbook list', () => {
    it.todo('should fetch wordbooks on mount');

    it.todo('should display wordbooks');

    it.todo('should handle empty wordbook list');
  });

  describe('navigation', () => {
    it.todo('should navigate to wordbook detail');
  });

  describe('error handling', () => {
    it.todo('should display error message on fetch failure');
  });
});
