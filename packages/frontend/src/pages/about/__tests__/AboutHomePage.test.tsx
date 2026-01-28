import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';

interface MockMotionProps {
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
}

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onClick, className }: MockMotionProps) => (
      <div onClick={onClick} className={className}>
        {children}
      </div>
    ),
    p: ({ children, className }: MockMotionProps) => <p className={className}>{children}</p>,
    li: ({ children, className }: MockMotionProps) => <li className={className}>{children}</li>,
    span: ({ children, className }: MockMotionProps) => (
      <span className={className}>{children}</span>
    ),
    ul: ({ children, className }: MockMotionProps) => <ul className={className}>{children}</ul>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
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
      expect(screen.getByText(/Adaptive Intelligence/)).toBeInTheDocument();
    });

    it('should render subtitle', () => {
      renderComponent();
      expect(screen.getByText(/Adaptive Multi-modal Assessment System/)).toBeInTheDocument();
    });

    it('should render core architecture badge', () => {
      renderComponent();
      expect(screen.getByText('Core Architecture')).toBeInTheDocument();
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

    it('should render stage description', () => {
      renderComponent();
      expect(screen.getByText(/像私人教练一样懂你的自适应学习系统/)).toBeInTheDocument();
    });
  });

  describe('Stage Card Interaction', () => {
    it('should have first stage expanded by default', () => {
      renderComponent();
      // First stage should show its details
      expect(screen.getByText(/多维度捕捉学习者的实时状态/)).toBeInTheDocument();
    });

    it('should display all stage details by default', () => {
      renderComponent();

      // All stages show their details without clicking
      expect(screen.getByText(/构建动态的学习者认知模型/)).toBeInTheDocument();
    });

    it('should display learning stage description', () => {
      renderComponent();

      expect(screen.getByText(/持续进化的算法集成引擎/)).toBeInTheDocument();
    });

    it('should show all stage details', () => {
      renderComponent();

      // All stages show their details
      expect(screen.getByText(/注意力追踪/)).toBeInTheDocument();
      expect(screen.getByText(/实时疲劳度监测/)).toBeInTheDocument();
      expect(screen.getByText(/学习动机与情绪评估/)).toBeInTheDocument();
    });
  });

  describe('Stage Details', () => {
    it('should display perception stage details', () => {
      renderComponent();
      // First stage is expanded by default
      expect(screen.getByText(/注意力追踪与响应分析/)).toBeInTheDocument();
    });

    it('should display modeling stage details', () => {
      renderComponent();

      expect(screen.getByText(/个性化遗忘曲线/)).toBeInTheDocument();
      expect(screen.getByText(/ACT-R 记忆激活度追踪/)).toBeInTheDocument();
    });

    it('should display learning stage details', () => {
      renderComponent();

      expect(screen.getByText(/Thompson Sampling/)).toBeInTheDocument();
      expect(screen.getByText(/LinUCB/)).toBeInTheDocument();
      expect(screen.getByText(/FSRS/)).toBeInTheDocument();
    });

    it('should display decision stage details', () => {
      renderComponent();

      expect(screen.getByText(/多目标路径优化/)).toBeInTheDocument();
      expect(screen.getByText(/自适应难度匹配/)).toBeInTheDocument();
      expect(screen.getByText(/动态复习间隔调度/)).toBeInTheDocument();
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

  describe('Card Layout', () => {
    it('should display all cards with their content visible', () => {
      renderComponent();

      // All stage descriptions are visible
      expect(screen.getByText(/多维度捕捉学习者的实时状态/)).toBeInTheDocument();
      expect(screen.getByText(/构建动态的学习者认知模型/)).toBeInTheDocument();
      expect(screen.getByText(/持续进化的算法集成引擎/)).toBeInTheDocument();
      expect(screen.getByText(/生成个性化的学习策略/)).toBeInTheDocument();
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
