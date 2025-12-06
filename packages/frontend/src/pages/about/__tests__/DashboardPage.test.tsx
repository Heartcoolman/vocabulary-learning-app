import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import DashboardPage from '../DashboardPage';

// Mock aboutApi
const mockMixedDecisions = {
  real: [
    {
      decisionId: 'decision-1',
      pseudoId: 'user-abc',
      timestamp: '2024-01-15T10:00:00.000Z',
      decisionSource: 'ensemble',
      strategy: { difficulty: 'mid', batch_size: 10 },
      dominantFactor: 'memory',
    },
    {
      decisionId: 'decision-2',
      pseudoId: 'user-def',
      timestamp: '2024-01-15T09:30:00.000Z',
      decisionSource: 'coldstart',
      strategy: { difficulty: 'easy', batch_size: 8 },
      dominantFactor: 'attention',
    },
  ],
  virtual: [
    {
      decisionId: 'virtual-1',
      pseudoId: 'sim-user-1',
      timestamp: '2024-01-15T10:05:00.000Z',
      decisionSource: 'ensemble',
      strategy: { difficulty: 'hard', batch_size: 12 },
      dominantFactor: 'fatigue',
    },
  ],
};

const mockDecisionDetail = {
  decisionId: 'decision-1',
  pseudoId: 'user-abc',
  timestamp: '2024-01-15T10:00:00.000Z',
  userState: {
    attention: 0.8,
    fatigue: 0.2,
    motivation: 0.7,
  },
  cognitiveProfile: {
    memory: 0.75,
    speed: 0.82,
    stability: 0.68,
  },
  algorithmOutputs: {
    thompson: { difficulty: 'mid', confidence: 0.85 },
    linucb: { difficulty: 'mid', confidence: 0.78 },
    actr: { difficulty: 'easy', confidence: 0.65 },
    heuristic: { difficulty: 'mid', confidence: 0.72 },
  },
  finalDecision: {
    difficulty: 'mid',
    interval_scale: 1.2,
    new_ratio: 0.3,
  },
  decisionSource: 'ensemble',
  weights: {
    thompson: 0.35,
    linucb: 0.25,
    actr: 0.2,
    heuristic: 0.2,
  },
};

vi.mock('../../../services/aboutApi', () => ({
  getMixedDecisions: vi.fn(),
  getDecisionDetail: vi.fn(),
  subscribeToDecisions: vi.fn(),
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  amasLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock DecisionDetailPanel
vi.mock('../components/DecisionDetailPanel', () => ({
  DecisionDetailPanel: ({ decision }: any) => (
    <div data-testid="decision-detail-panel">
      {decision ? (
        <>
          <span>{decision.pseudoId}</span>
          <span>{decision.decisionSource}</span>
        </>
      ) : (
        <span>No decision selected</span>
      )}
    </div>
  ),
}));

import { getMixedDecisions, getDecisionDetail, subscribeToDecisions } from '../../../services/aboutApi';

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMixedDecisions as any).mockResolvedValue(mockMixedDecisions);
    (getDecisionDetail as any).mockResolvedValue(mockDecisionDetail);
    (subscribeToDecisions as any).mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
  };

  describe('Rendering', () => {
    it('should render sidebar header', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('近期决策')).toBeInTheDocument();
      });
    });

    it('should render tab filters', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/全部/)).toBeInTheDocument();
        expect(screen.getByText(/真实/)).toBeInTheDocument();
        expect(screen.getByText(/模拟/)).toBeInTheDocument();
      });
    });

    it('should render decision cards', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('user-abc')).toBeInTheDocument();
        expect(screen.getByText('user-def')).toBeInTheDocument();
      });
    });

    it('should render decision detail panel', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('decision-detail-panel')).toBeInTheDocument();
      });
    });
  });

  describe('Decision List', () => {
    it('should load decisions on mount', async () => {
      renderComponent();

      await waitFor(() => {
        expect(getMixedDecisions).toHaveBeenCalled();
      });
    });

    it('should display real and virtual decisions', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('user-abc')).toBeInTheDocument();
        expect(screen.getByText('sim-user-1')).toBeInTheDocument();
      });
    });

    it('should show decision difficulty badge', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('mid')).toBeInTheDocument();
        expect(screen.getByText('easy')).toBeInTheDocument();
      });
    });

    it('should show decision source badge', async () => {
      renderComponent();

      await waitFor(() => {
        // Multiple "真实" badges appear - one for each real decision card
        const realBadges = screen.getAllByText('真实');
        expect(realBadges.length).toBeGreaterThan(0);
        const simulatedBadges = screen.getAllByText('模拟');
        expect(simulatedBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Tab Filtering', () => {
    it('should filter by real decisions', async () => {
      renderComponent();

      // Wait for decisions to load
      await waitFor(() => {
        expect(screen.getByText('user-abc')).toBeInTheDocument();
      });

      // Find the tab button specifically (contains count in parentheses)
      const realTabButton = screen.getByRole('button', { name: /真实 \(\d+\)/ });
      expect(realTabButton).toBeInTheDocument();
    });

    it('should filter by virtual decisions', async () => {
      renderComponent();

      await waitFor(() => {
        const virtualTabButton = screen.getByRole('button', { name: /模拟 \(\d+\)/ });
        expect(virtualTabButton).toBeInTheDocument();
      });

      const virtualTabButton = screen.getByRole('button', { name: /模拟 \(\d+\)/ });
      fireEvent.click(virtualTabButton);

      await waitFor(() => {
        expect(screen.getByText('sim-user-1')).toBeInTheDocument();
      });
    });

    it('should show all decisions with all tab selected by default', async () => {
      renderComponent();

      // By default, "all" tab is selected showing all decisions
      await waitFor(() => {
        expect(screen.getByText('user-abc')).toBeInTheDocument();
        expect(screen.getByText('sim-user-1')).toBeInTheDocument();
      });

      // Verify the all tab button shows correct count
      const allTabButton = screen.getByRole('button', { name: /全部 \(\d+\)/ });
      expect(allTabButton).toBeInTheDocument();
    });
  });

  describe('Decision Selection', () => {
    it('should select first decision by default', async () => {
      renderComponent();

      await waitFor(() => {
        expect(getDecisionDetail).toHaveBeenCalled();
      });
    });

    it('should load decision detail when clicking on decision', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('user-def')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('user-def'));

      await waitFor(() => {
        expect(getDecisionDetail).toHaveBeenCalledWith('decision-2', 'real');
      });
    });
  });

  describe('SSE Connection', () => {
    it('should subscribe to decisions on mount', async () => {
      renderComponent();

      await waitFor(() => {
        expect(subscribeToDecisions).toHaveBeenCalled();
      });
    });

    it('should show connection status', async () => {
      renderComponent();

      await waitFor(() => {
        // Should show either connected or disconnected status
        const statusText = screen.queryByText(/实时连接中|连接中断/);
        expect(statusText).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when loading fails', async () => {
      (getMixedDecisions as any).mockRejectedValue(new Error('连接失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/无法连接到决策服务/)).toBeInTheDocument();
      });
    });

    it('should show error when loading detail fails', async () => {
      (getDecisionDetail as any).mockRejectedValue(new Error('获取详情失败'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/加载决策详情失败|获取决策详情失败/)).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no decisions', async () => {
      (getMixedDecisions as any).mockResolvedValue({
        real: [],
        virtual: [],
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/暂无决策记录|暂无真实决策记录/)).toBeInTheDocument();
      });
    });

    it('should show specific empty message for real tab', async () => {
      (getMixedDecisions as any).mockResolvedValue({
        real: [],
        virtual: mockMixedDecisions.virtual,
      });

      renderComponent();

      await waitFor(() => {
        const realTabButton = screen.getByRole('button', { name: /真实 \(\d+\)/ });
        expect(realTabButton).toBeInTheDocument();
      });

      const realTabButton = screen.getByRole('button', { name: /真实 \(\d+\)/ });
      fireEvent.click(realTabButton);

      await waitFor(() => {
        expect(screen.getByText(/暂无真实决策记录/)).toBeInTheDocument();
      });
    });
  });

  describe('Decision Card Details', () => {
    it('should display decision timestamp', async () => {
      renderComponent();

      await waitFor(() => {
        // Should show formatted time (18:00:00 for 10:00:00 UTC in UTC+8)
        const timeElements = screen.getAllByText(/\d{2}:\d{2}:\d{2}/);
        expect(timeElements.length).toBeGreaterThan(0);
      });
    });

    it('should display decision source', async () => {
      renderComponent();

      await waitFor(() => {
        // The decisionSource is displayed in the card - check for any of the expected sources
        const sourceElements = screen.getAllByText(/ensemble|coldstart/i);
        expect(sourceElements.length).toBeGreaterThan(0);
      });
    });
  });
});
