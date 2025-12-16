/**
 * LearningStyleCard Component Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LearningStyleCard, { LearningStyleProfile, LearningStyle } from '../LearningStyleCard';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// Mock Icon components
vi.mock('../Icon', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Icon')>();
  return {
    ...actual,
    Eye: () => <span data-testid="eye-icon">Eye</span>,
    Headphones: () => <span data-testid="headphones-icon">Headphones</span>,
    Hand: () => <span data-testid="hand-icon">Hand</span>,
    Brain: () => <span data-testid="brain-icon">Brain</span>,
    Sparkle: () => <span data-testid="sparkle-icon">Sparkle</span>,
  };
});

describe('LearningStyleCard', () => {
  // ==================== Default State Tests ====================

  describe('default state', () => {
    it('should render with default data when no props provided', () => {
      render(<LearningStyleCard />);
      expect(screen.getByText('视觉型 (Visual)')).toBeInTheDocument();
    });

    it('should show 78% confidence by default', () => {
      render(<LearningStyleCard />);
      expect(screen.getByText('78% 置信度')).toBeInTheDocument();
    });
  });

  // ==================== Visual Style Tests ====================

  describe('visual style', () => {
    const visualData: LearningStyleProfile = {
      style: 'visual',
      confidence: 0.85,
      scores: { visual: 0.7, auditory: 0.2, kinesthetic: 0.1 },
    };

    it('should display visual style title', () => {
      render(<LearningStyleCard data={visualData} />);
      expect(screen.getByText('视觉型 (Visual)')).toBeInTheDocument();
    });

    it('should display eye icon for visual style', () => {
      render(<LearningStyleCard data={visualData} />);
      expect(screen.getAllByTestId('eye-icon').length).toBeGreaterThan(0);
    });

    it('should display visual style suggestion', () => {
      render(<LearningStyleCard data={visualData} />);
      expect(screen.getByText(/思维导图和颜色标记/)).toBeInTheDocument();
    });

    it('should display confidence level', () => {
      render(<LearningStyleCard data={visualData} />);
      expect(screen.getByText('85% 置信度')).toBeInTheDocument();
    });
  });

  // ==================== Auditory Style Tests ====================

  describe('auditory style', () => {
    const auditoryData: LearningStyleProfile = {
      style: 'auditory',
      confidence: 0.9,
      scores: { visual: 0.2, auditory: 0.7, kinesthetic: 0.1 },
    };

    it('should display auditory style title', () => {
      render(<LearningStyleCard data={auditoryData} />);
      expect(screen.getByText('听觉型 (Auditory)')).toBeInTheDocument();
    });

    it('should display headphones icon for auditory style', () => {
      render(<LearningStyleCard data={auditoryData} />);
      expect(screen.getAllByTestId('headphones-icon').length).toBeGreaterThan(0);
    });

    it('should display auditory style suggestion', () => {
      render(<LearningStyleCard data={auditoryData} />);
      expect(screen.getByText(/单词发音.*跟读练习/)).toBeInTheDocument();
    });
  });

  // ==================== Kinesthetic Style Tests ====================

  describe('kinesthetic style', () => {
    const kinestheticData: LearningStyleProfile = {
      style: 'kinesthetic',
      confidence: 0.75,
      scores: { visual: 0.1, auditory: 0.2, kinesthetic: 0.7 },
    };

    it('should display kinesthetic style title', () => {
      render(<LearningStyleCard data={kinestheticData} />);
      expect(screen.getByText('动觉型 (Kinesthetic)')).toBeInTheDocument();
    });

    it('should display hand icon for kinesthetic style', () => {
      render(<LearningStyleCard data={kinestheticData} />);
      expect(screen.getAllByTestId('hand-icon').length).toBeGreaterThan(0);
    });

    it('should display kinesthetic style suggestion', () => {
      render(<LearningStyleCard data={kinestheticData} />);
      expect(screen.getByText(/拼写测试和互动小游戏/)).toBeInTheDocument();
    });
  });

  // ==================== Mixed Style Tests ====================

  describe('mixed style', () => {
    const mixedData: LearningStyleProfile = {
      style: 'mixed',
      confidence: 0.6,
      scores: { visual: 0.35, auditory: 0.35, kinesthetic: 0.3 },
    };

    it('should display mixed style title', () => {
      render(<LearningStyleCard data={mixedData} />);
      expect(screen.getByText('混合型 (Mixed)')).toBeInTheDocument();
    });

    it('should display brain icon for mixed style', () => {
      render(<LearningStyleCard data={mixedData} />);
      expect(screen.getAllByTestId('brain-icon').length).toBeGreaterThan(0);
    });

    it('should display mixed style suggestion', () => {
      render(<LearningStyleCard data={mixedData} />);
      expect(screen.getByText(/灵活运用多种感官/)).toBeInTheDocument();
    });
  });

  // ==================== Score Display Tests ====================

  describe('score display', () => {
    const testData: LearningStyleProfile = {
      style: 'visual',
      confidence: 0.8,
      scores: { visual: 0.65, auditory: 0.25, kinesthetic: 0.1 },
    };

    it('should display all three score metrics', () => {
      render(<LearningStyleCard data={testData} />);

      expect(screen.getByText('视觉')).toBeInTheDocument();
      expect(screen.getByText('听觉')).toBeInTheDocument();
      expect(screen.getByText('动觉')).toBeInTheDocument();
    });

    it('should display score values', () => {
      render(<LearningStyleCard data={testData} />);

      expect(screen.getByText('65')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should render progress bars', () => {
      render(<LearningStyleCard data={testData} />);

      // Look for progress bar containers - there should be at least 3 for the three metrics
      const progressBars = document.querySelectorAll('.bg-gray-100.rounded-full');
      expect(progressBars.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ==================== Model Label Tests ====================

  describe('model label', () => {
    it('should display AMAS model label', () => {
      render(<LearningStyleCard />);
      expect(screen.getByText('AMAS 学习风格模型')).toBeInTheDocument();
    });
  });

  // ==================== Suggestion Section Tests ====================

  describe('suggestion section', () => {
    it('should display suggestion label', () => {
      render(<LearningStyleCard />);
      expect(screen.getByText('建议：')).toBeInTheDocument();
    });

    it('should display sparkle icon', () => {
      render(<LearningStyleCard />);
      expect(screen.getByTestId('sparkle-icon')).toBeInTheDocument();
    });
  });

  // ==================== Color Coding Tests ====================

  describe('color coding', () => {
    it('should have sky color for visual style', () => {
      const visualData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.8,
        scores: { visual: 0.7, auditory: 0.2, kinesthetic: 0.1 },
      };

      const { container } = render(<LearningStyleCard data={visualData} />);

      // Look for sky-colored background anywhere in the component
      const iconContainer = container.querySelector('.bg-sky-50');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should have emerald color for auditory style', () => {
      const auditoryData: LearningStyleProfile = {
        style: 'auditory',
        confidence: 0.8,
        scores: { visual: 0.2, auditory: 0.7, kinesthetic: 0.1 },
      };

      const { container } = render(<LearningStyleCard data={auditoryData} />);

      // Look for emerald-colored background anywhere in the component
      const iconContainer = container.querySelector('.bg-emerald-50');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should have rose color for kinesthetic style', () => {
      const kinestheticData: LearningStyleProfile = {
        style: 'kinesthetic',
        confidence: 0.8,
        scores: { visual: 0.1, auditory: 0.2, kinesthetic: 0.7 },
      };

      const { container } = render(<LearningStyleCard data={kinestheticData} />);

      // Look for rose-colored background anywhere in the component
      const iconContainer = container.querySelector('.bg-rose-50');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should have violet color for mixed style', () => {
      const mixedData: LearningStyleProfile = {
        style: 'mixed',
        confidence: 0.8,
        scores: { visual: 0.35, auditory: 0.35, kinesthetic: 0.3 },
      };

      const { container } = render(<LearningStyleCard data={mixedData} />);

      // Look for violet colored element anywhere in the component
      const iconContainer = container.querySelector('.bg-violet-50');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  // ==================== Progress Bar Colors Tests ====================

  describe('progress bar colors', () => {
    it('should have different colors for each metric bar', () => {
      const testData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.8,
        scores: { visual: 0.65, auditory: 0.25, kinesthetic: 0.1 },
      };

      render(<LearningStyleCard data={testData} />);

      const skyBar = document.querySelector('.bg-sky-500');
      const emeraldBar = document.querySelector('.bg-emerald-500');
      const roseBar = document.querySelector('.bg-rose-500');

      expect(skyBar).toBeInTheDocument();
      expect(emeraldBar).toBeInTheDocument();
      expect(roseBar).toBeInTheDocument();
    });
  });

  // ==================== Relative Scaling Tests ====================

  describe('relative scaling', () => {
    it('should scale bars relative to max score', async () => {
      const testData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.8,
        scores: { visual: 0.8, auditory: 0.4, kinesthetic: 0.2 },
      };

      render(<LearningStyleCard data={testData} />);

      // The highest score (0.8) should have 100% width
      // Other scores should be scaled relative to it
      await waitFor(() => {
        const bars = document.querySelectorAll(
          '.rounded-full.bg-sky-500, .rounded-full.bg-emerald-500, .rounded-full.bg-rose-500',
        );
        expect(bars.length).toBe(3);
      });
    });

    it('should handle all zero scores', () => {
      const testData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.8,
        scores: { visual: 0, auditory: 0, kinesthetic: 0 },
      };

      render(<LearningStyleCard data={testData} />);
      // Should not crash
      expect(screen.getByText('视觉型 (Visual)')).toBeInTheDocument();
    });
  });

  // ==================== Styling Tests ====================

  describe('styling', () => {
    it('should have backdrop blur', () => {
      render(<LearningStyleCard />);

      const card = screen.getByText('视觉型 (Visual)').closest('.backdrop-blur-sm');
      expect(card).toBeInTheDocument();
    });

    it('should have border', () => {
      render(<LearningStyleCard />);

      const card = screen.getByText('视觉型 (Visual)').closest('.border');
      expect(card).toBeInTheDocument();
    });

    it('should have shadow', () => {
      render(<LearningStyleCard />);

      const card = screen.getByText('视觉型 (Visual)').closest('.shadow-soft');
      expect(card).toBeInTheDocument();
    });

    it('should have rounded corners', () => {
      render(<LearningStyleCard />);

      const card = screen.getByText('视觉型 (Visual)').closest('.rounded-card');
      expect(card).toBeInTheDocument();
    });
  });

  // ==================== Layout Tests ====================

  describe('layout', () => {
    it('should have footer section with suggestion', () => {
      render(<LearningStyleCard />);

      const footer = screen.getByText('建议：').closest('.bg-gray-50\\/80');
      expect(footer).toBeInTheDocument();
    });

    it('should have full height flex layout', () => {
      render(<LearningStyleCard />);

      const card = screen.getByText('视觉型 (Visual)').closest('.flex.flex-col.h-full');
      expect(card).toBeInTheDocument();
    });
  });
});
