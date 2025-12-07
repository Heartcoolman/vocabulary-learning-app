import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import SimulationPage from '../SimulationPage';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    header: ({ children, ...props }: any) => <header {...props}>{children}</header>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock aboutApi
const mockSimulateResponse = {
  inputState: {
    A: 0.7,
    F: 0.2,
    M: 0.6,
    C: { mem: 0.6, speed: 0.7, stability: 0.6 },
    conf: 0.85,
  },
  outputStrategy: {
    difficulty: 'mid',
    interval_scale: 1.2,
    new_ratio: 0.3,
    batch_size: 10,
    hint_level: 1,
  },
  decisionProcess: {
    phase: 'normal' as const,
    decisionSource: 'ensemble' as const,
    votes: {
      thompson: { action: 'mid', contribution: 0.35, confidence: 0.85 },
      linucb: { action: 'mid', contribution: 0.25, confidence: 0.78 },
      actr: { action: 'easy', contribution: 0.2, confidence: 0.65 },
      heuristic: { action: 'mid', contribution: 0.2, confidence: 0.72 },
    },
    weights: {
      thompson: 0.35,
      linucb: 0.25,
      actr: 0.2,
      heuristic: 0.2,
    },
  },
  explanation: {
    summary: '基于当前用户状态，建议中等难度学习内容',
    factors: [
      { name: '注意力', value: 0.7, impact: 'positive', percentage: 25 },
      { name: '疲劳度', value: 0.2, impact: 'negative', percentage: 10 },
      { name: '动机', value: 0.6, impact: 'positive', percentage: 20 },
    ],
  },
};

vi.mock('../../../services/aboutApi', () => ({
  simulate: vi.fn(),
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  amasLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock animations
vi.mock('../../../utils/animations', () => ({
  fadeInVariants: {},
  staggerContainerVariants: {},
}));

import { simulate } from '../../../services/aboutApi';

describe('SimulationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (simulate as any).mockResolvedValue(mockSimulateResponse);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <SimulationPage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', () => {
      renderComponent();
      expect(screen.getByText('The Decision Lab')).toBeInTheDocument();
    });

    it('should render subtitle', () => {
      renderComponent();
      expect(screen.getByText('Interactive Neural Ensemble Simulator')).toBeInTheDocument();
    });

    it('should render scenario selection', () => {
      renderComponent();
      expect(screen.getByText('模拟场景')).toBeInTheDocument();
      expect(screen.getByText('新手起步')).toBeInTheDocument();
      expect(screen.getByText('精力充沛')).toBeInTheDocument();
      expect(screen.getByText('疲劳状态')).toBeInTheDocument();
      expect(screen.getByText('毕业时刻')).toBeInTheDocument();
    });

    it('should render learning mode selection', () => {
      renderComponent();
      expect(screen.getByText('学习模式')).toBeInTheDocument();
      expect(screen.getByText('标准模式')).toBeInTheDocument();
      expect(screen.getByText('突击模式')).toBeInTheDocument();
      expect(screen.getByText('轻松模式')).toBeInTheDocument();
    });

    it('should render parameter sliders', () => {
      renderComponent();
      expect(screen.getByText('用户状态向量')).toBeInTheDocument();
      expect(screen.getByText('注意力')).toBeInTheDocument();
      expect(screen.getByText('疲劳度')).toBeInTheDocument();
      expect(screen.getByText('动机')).toBeInTheDocument();
      expect(screen.getByText('记忆强度')).toBeInTheDocument();
      expect(screen.getByText('处理速度')).toBeInTheDocument();
    });

    it('should render run simulation button', () => {
      renderComponent();
      expect(screen.getByText('RUN SIMULATION')).toBeInTheDocument();
    });

    it('should render noise injection toggle', () => {
      renderComponent();
      expect(screen.getByText('注入随机噪声')).toBeInTheDocument();
    });
  });

  describe('Scenario Selection', () => {
    it('should select new user scenario by default', () => {
      renderComponent();
      const newUserButton = screen.getByText('新手起步').closest('button');
      expect(newUserButton).toHaveClass('bg-indigo-50');
    });

    it('should change scenario when clicking', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('疲劳状态'));

      await waitFor(() => {
        const tiredButton = screen.getByText('疲劳状态').closest('button');
        expect(tiredButton).toHaveClass('bg-indigo-50');
      });
    });

    it('should update parameters when scenario changes', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('精力充沛'));

      // Parameters should be updated to motivated preset
      // This would show higher attention value in the slider display
    });
  });

  describe('Learning Mode Selection', () => {
    it('should select standard mode by default', () => {
      renderComponent();
      const standardButton = screen.getByText('标准模式').closest('button');
      expect(standardButton).toHaveClass('bg-emerald-50');
    });

    it('should change learning mode when clicking', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('突击模式'));

      await waitFor(() => {
        const cramButton = screen.getByText('突击模式').closest('button');
        expect(cramButton).toHaveClass('bg-emerald-50');
      });
    });
  });

  describe('Parameter Sliders', () => {
    it('should display default parameter values', () => {
      renderComponent();
      // Default attention is 0.7, cognitive.speed is also 0.7 - multiple 0.70 values
      const values = screen.getAllByText('0.70');
      expect(values.length).toBeGreaterThan(0);
    });

    it('should allow adjusting parameters', async () => {
      renderComponent();

      const sliders = screen.getAllByRole('slider');
      expect(sliders.length).toBeGreaterThan(0);

      // Change the first slider (attention)
      fireEvent.change(sliders[0], { target: { value: '0.9' } });

      await waitFor(() => {
        const ninetyValues = screen.getAllByText('0.90');
        expect(ninetyValues.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Noise Injection', () => {
    it('should toggle noise injection', async () => {
      renderComponent();

      const toggle = screen.getByText('注入随机噪声').closest('div')?.querySelector('button');
      if (toggle) {
        fireEvent.click(toggle);
        // Toggle should be activated
      }
    });
  });

  describe('Run Simulation', () => {
    it('should run simulation when clicking button', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        expect(simulate).toHaveBeenCalled();
      });
    });

    it('should display results after simulation', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        // Multiple "中等" elements may appear (difficulty display + mode display)
        const elements = screen.getAllByText(/中等/);
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('should show consensus visualization', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        expect(screen.getByText(/决策共识/)).toBeInTheDocument();
      });
    });

    it('should show decision receipt', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        expect(screen.getByText(/决策凭证/)).toBeInTheDocument();
      });
    });

    it('should show neural logic trace', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        expect(screen.getByText('Neural Logic Trace')).toBeInTheDocument();
      });
    });
  });

  describe('Results Display', () => {
    it('should display difficulty in decision receipt', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        // Multiple "中等" elements may appear (difficulty display + mode display)
        const elements = screen.getAllByText(/中等/);
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('should display interval scale', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        // Look for interval scale display - may have multiple elements
        const scaleElements = screen.getAllByText(/x1\.2|1\.2/);
        expect(scaleElements.length).toBeGreaterThan(0);
      });
    });

    it('should display dominant algorithm', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        // THOMPSON appears in tooltip and possibly in algorithm display
        const thompsonElements = screen.getAllByText(/THOMPSON/i);
        expect(thompsonElements.length).toBeGreaterThan(0);
      });
    });

    it('should display explanation summary', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        expect(screen.getByText(/基于当前用户状态/)).toBeInTheDocument();
      });
    });

    it('should display factor impacts', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      // Wait for simulation results to appear
      await waitFor(() => {
        // Check for explanation summary which confirms simulation completed
        expect(screen.getByText(/基于当前用户状态/)).toBeInTheDocument();
      });

      // Multiple "注意力" elements may exist - one in slider, one in factors
      const attentionElements = screen.getAllByText(/注意力/);
      expect(attentionElements.length).toBeGreaterThan(0);

      // Check for percentage display
      expect(screen.getByText(/\+25%/)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading state while simulating', async () => {
      // Create a controllable promise
      let resolvePromise: (value: typeof mockSimulateResponse) => void;
      const pendingPromise = new Promise<typeof mockSimulateResponse>((resolve) => {
        resolvePromise = resolve;
      });

      (simulate as any).mockReturnValue(pendingPromise);

      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      // Should show loading indicator
      await waitFor(() => {
        expect(screen.getByText(/计算神经网络权重/)).toBeInTheDocument();
      });

      // Resolve the simulation
      resolvePromise!(mockSimulateResponse);

      await waitFor(() => {
        expect(screen.queryByText(/计算神经网络权重/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle simulation error gracefully', async () => {
      (simulate as any).mockRejectedValue(new Error('Simulation failed'));

      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      // Should not crash, error should be logged
      await waitFor(() => {
        expect(simulate).toHaveBeenCalled();
      });
    });
  });

  describe('Active Core Display', () => {
    it('should display active core based on decision source', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        expect(screen.getByText(/Ensemble Council|ColdStart Engine/)).toBeInTheDocument();
      });
    });
  });

  describe('Phase Display', () => {
    it('should display decision phase', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('RUN SIMULATION'));

      await waitFor(() => {
        expect(screen.getByText(/阶段.*正常|探索|分类/)).toBeInTheDocument();
      });
    });
  });
});
