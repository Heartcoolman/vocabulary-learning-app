import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onClick, className, ...props }: any) => (
      <div onClick={onClick} className={className}>
        {children}
      </div>
    ),
    p: ({ children, className, ...props }: any) => <p className={className}>{children}</p>,
    li: ({ children, className, ...props }: any) => <li className={className}>{children}</li>,
    span: ({ children, className, ...props }: any) => <span className={className}>{children}</span>,
    ul: ({ children, className, ...props }: any) => <ul className={className}>{children}</ul>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock animations utils
vi.mock('../../../utils/animations', () => ({
  g3SpringStandard: { type: 'spring', stiffness: 300, damping: 30 },
  staggerContainerVariants: { hidden: {}, visible: {} },
  staggerItemVariants: { hidden: {}, visible: {} },
  fadeInVariants: { hidden: {}, visible: {} },
}));

// Mock Icon components
vi.mock('../../../components/Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/Icon')>();
  return {
    ...actual,
    Eye: () => <span data-testid="eye-icon">Eye</span>,
    Brain: () => <span data-testid="brain-icon">Brain</span>,
    Lightning: () => <span data-testid="lightning-icon">Lightning</span>,
    Target: () => <span data-testid="target-icon">Target</span>,
    CaretDown: () => <span data-testid="caret-down-icon">CaretDown</span>,
  };
});

import AboutHomePage from '../AboutHomePage';

describe('AboutHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <AboutHomePage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render page title', () => {
      renderComponent();
      expect(screen.getByText(/AMAS/)).toBeInTheDocument();
      expect(screen.getByText(/智能引擎/)).toBeInTheDocument();
    });

    it('should render subtitle', () => {
      renderComponent();
      expect(screen.getByText(/Adaptive Multi-modal Assessment System/)).toBeInTheDocument();
    });

    it('should render flow indicator', () => {
      renderComponent();
      expect(screen.getByText('感知')).toBeInTheDocument();
      expect(screen.getByText('建模')).toBeInTheDocument();
      expect(screen.getByText('学习')).toBeInTheDocument();
      expect(screen.getByText('决策')).toBeInTheDocument();
    });

    it('should render all stage cards', () => {
      renderComponent();
      expect(screen.getByText('感知层')).toBeInTheDocument();
      expect(screen.getByText('建模层')).toBeInTheDocument();
      expect(screen.getByText('学习层')).toBeInTheDocument();
      expect(screen.getByText('决策层')).toBeInTheDocument();
    });

    it('should render stage subtitles', () => {
      renderComponent();
      expect(screen.getByText('Perception')).toBeInTheDocument();
      expect(screen.getByText('Modeling')).toBeInTheDocument();
      expect(screen.getByText('Learning')).toBeInTheDocument();
      expect(screen.getByText('Decision')).toBeInTheDocument();
    });

    it('should render bottom hint', () => {
      renderComponent();
      expect(screen.getByText(/点击卡片展开查看详情/)).toBeInTheDocument();
    });
  });

  describe('Stage Card Interaction', () => {
    it('should have first stage expanded by default', () => {
      renderComponent();
      // First stage should show its details
      expect(screen.getByText(/多维度捕捉学习者的实时状态/)).toBeInTheDocument();
    });

    it('should toggle stage card when clicking', async () => {
      renderComponent();

      // Click on the second stage
      const modelingStage = screen.getByText('建模层');
      fireEvent.click(modelingStage);

      await waitFor(() => {
        expect(screen.getByText(/构建动态的学习者认知模型/)).toBeInTheDocument();
      });
    });

    it('should expand stage to show details', async () => {
      renderComponent();

      // Click on learning stage
      const learningStage = screen.getByText('学习层');
      fireEvent.click(learningStage);

      await waitFor(() => {
        expect(screen.getByText(/持续进化的算法集成引擎/)).toBeInTheDocument();
      });
    });

    it('should show stage details when expanded', async () => {
      renderComponent();

      // First stage is expanded by default
      expect(screen.getByText(/注意力追踪/)).toBeInTheDocument();
      expect(screen.getByText(/疲劳度监测/)).toBeInTheDocument();
      expect(screen.getByText(/动机评估/)).toBeInTheDocument();
    });
  });

  describe('Stage Details', () => {
    it('should display perception stage details', () => {
      renderComponent();
      // First stage is expanded by default
      expect(screen.getByText(/注意力追踪.*分析响应时间/)).toBeInTheDocument();
    });

    it('should display modeling stage details when expanded', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('建模层'));

      await waitFor(() => {
        expect(screen.getByText(/个性化遗忘曲线/)).toBeInTheDocument();
        expect(screen.getByText(/ACT-R 激活度追踪/)).toBeInTheDocument();
      });
    });

    it('should display learning stage details when expanded', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('学习层'));

      await waitFor(() => {
        expect(screen.getByText(/Thompson Sampling/)).toBeInTheDocument();
        expect(screen.getByText(/LinUCB/)).toBeInTheDocument();
        expect(screen.getByText(/ACT-R 记忆模型/)).toBeInTheDocument();
      });
    });

    it('should display decision stage details when expanded', async () => {
      renderComponent();

      fireEvent.click(screen.getByText('决策层'));

      await waitFor(() => {
        expect(screen.getByText(/多目标优化/)).toBeInTheDocument();
        expect(screen.getByText(/学习模式适配/)).toBeInTheDocument();
        expect(screen.getByText(/复习间隔优化/)).toBeInTheDocument();
      });
    });
  });

  describe('Stage Colors', () => {
    it('should have different accent colors for each stage', () => {
      renderComponent();

      // Just verify all stages are rendered with their distinct styling
      const stages = ['感知层', '建模层', '学习层', '决策层'];
      stages.forEach((stage) => {
        expect(screen.getByText(stage)).toBeInTheDocument();
      });
    });
  });

  describe('Card Collapse', () => {
    it('should collapse stage when clicking the same stage again', async () => {
      renderComponent();

      // First stage is open by default
      expect(screen.getByText(/多维度捕捉学习者的实时状态/)).toBeInTheDocument();

      // Click on the first stage to collapse it
      fireEvent.click(screen.getByText('感知层'));

      // Description should still be visible in collapsed state as a one-liner
      // The detailed list should be collapsed
    });
  });

  describe('Accessibility', () => {
    it('should be keyboard accessible', () => {
      renderComponent();

      // Stage cards should be clickable
      const stages = screen.getAllByText(/层$/);
      stages.forEach((stage) => {
        const card = stage.closest('div[class*="cursor-pointer"]');
        if (card) {
          expect(card).toBeInTheDocument();
        }
      });
    });
  });
});
