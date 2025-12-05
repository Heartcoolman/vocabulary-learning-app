/**
 * AchievementPage Tests
 */

import { describe, it, vi, beforeEach } from 'vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    isAuthenticated: true,
  }),
}));

vi.mock('@/services/ApiClient', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { badges: [] } }),
  },
}));

describe('AchievementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it.todo('should render achievement page');

    it.todo('should display badges section');
  });

  describe('badges', () => {
    it.todo('should fetch badges on mount');

    it.todo('should display earned badges');

    it.todo('should display locked badges');
  });

  describe('progress', () => {
    it.todo('should show badge progress');
  });
});
