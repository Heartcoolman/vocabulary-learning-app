/**
 * PlanPage Tests
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
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

describe('PlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it.todo('should render plan page');

    it.todo('should display current plan');
  });

  describe('plan generation', () => {
    it.todo('should generate new plan');

    it.todo('should display plan suggestions');
  });

  describe('plan progress', () => {
    it.todo('should show daily progress');

    it.todo('should show weekly progress');
  });
});
