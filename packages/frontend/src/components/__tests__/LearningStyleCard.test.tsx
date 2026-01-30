/**
 * LearningStyleCard Component Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LearningStyleCard, { LearningStyleProfile } from '../LearningStyleCard';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
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
    BookOpen: () => <span data-testid="book-open-icon">BookOpen</span>,
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

  // ==================== Reading Style Tests ====================

  describe('reading style', () => {
    const readingData: LearningStyleProfile = {
      style: 'reading',
      confidence: 0.82,
      scores: { visual: 0.15, auditory: 0.1, reading: 0.65, kinesthetic: 0.1 },
    };

    it('should display reading style title', () => {
      render(<LearningStyleCard data={readingData} />);
      expect(screen.getByText('读写型 (Reading)')).toBeInTheDocument();
    });

    it('should display book-open icon for reading style', () => {
      render(<LearningStyleCard data={readingData} />);
      expect(screen.getAllByTestId('book-open-icon').length).toBeGreaterThan(0);
    });

    it('should display reading style suggestion', () => {
      render(<LearningStyleCard data={readingData} />);
      expect(screen.getByText(/例句和释义/)).toBeInTheDocument();
    });

    it('should have amber color for reading style', () => {
      const { container } = render(<LearningStyleCard data={readingData} />);
      const iconContainer = container.querySelector('.bg-amber-50');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  // ==================== Multimodal Style Tests ====================

  describe('multimodal style', () => {
    const multimodalData: LearningStyleProfile = {
      style: 'multimodal',
      confidence: 0.7,
      scores: { visual: 0.28, auditory: 0.26, reading: 0.24, kinesthetic: 0.22 },
    };

    it('should display multimodal style title', () => {
      render(<LearningStyleCard data={multimodalData} />);
      expect(screen.getByText('多模态型 (Multimodal)')).toBeInTheDocument();
    });

    it('should display brain icon for multimodal style', () => {
      render(<LearningStyleCard data={multimodalData} />);
      expect(screen.getAllByTestId('brain-icon').length).toBeGreaterThan(0);
    });

    it('should display multimodal style suggestion', () => {
      render(<LearningStyleCard data={multimodalData} />);
      expect(screen.getByText(/灵活运用多种感官/)).toBeInTheDocument();
    });

    it('should have violet color for multimodal style', () => {
      const { container } = render(<LearningStyleCard data={multimodalData} />);
      const iconContainer = container.querySelector('.bg-violet-50');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  // ==================== Mixed -> Multimodal Compatibility Tests ====================

  describe('mixed to multimodal compatibility', () => {
    const mixedData: LearningStyleProfile = {
      style: 'mixed',
      confidence: 0.6,
      scores: { visual: 0.35, auditory: 0.35, kinesthetic: 0.3 },
    };

    it('should convert mixed style to multimodal display', () => {
      render(<LearningStyleCard data={mixedData} />);
      expect(screen.getByText('多模态型 (Multimodal)')).toBeInTheDocument();
    });

    it('should display brain icon for mixed style (converted to multimodal)', () => {
      render(<LearningStyleCard data={mixedData} />);
      expect(screen.getAllByTestId('brain-icon').length).toBeGreaterThan(0);
    });

    it('should display multimodal suggestion for mixed style input', () => {
      render(<LearningStyleCard data={mixedData} />);
      expect(screen.getByText(/灵活运用多种感官/)).toBeInTheDocument();
    });

    it('should have violet color for mixed style (as multimodal)', () => {
      const { container } = render(<LearningStyleCard data={mixedData} />);
      const iconContainer = container.querySelector('.bg-violet-50');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should handle legacy scores without reading dimension', () => {
      const legacyData: LearningStyleProfile = {
        style: 'mixed',
        confidence: 0.65,
        scores: { visual: 0.4, auditory: 0.3, kinesthetic: 0.3 },
      };

      render(<LearningStyleCard data={legacyData} />);

      // Should still display all four dimensions
      expect(screen.getByText('视觉')).toBeInTheDocument();
      expect(screen.getByText('听觉')).toBeInTheDocument();
      expect(screen.getByText('读写')).toBeInTheDocument();
      expect(screen.getByText('动觉')).toBeInTheDocument();

      // Reading should default to 0
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  // ==================== VARK Four-Dimensional Score Display Tests ====================

  describe('VARK four-dimensional score display', () => {
    const varkData: LearningStyleProfile = {
      style: 'visual',
      confidence: 0.8,
      scores: { visual: 0.45, auditory: 0.25, reading: 0.2, kinesthetic: 0.1 },
    };

    it('should display all four VARK score metrics', () => {
      render(<LearningStyleCard data={varkData} />);

      expect(screen.getByText('视觉')).toBeInTheDocument();
      expect(screen.getByText('听觉')).toBeInTheDocument();
      expect(screen.getByText('读写')).toBeInTheDocument();
      expect(screen.getByText('动觉')).toBeInTheDocument();
    });

    it('should display four score values', () => {
      render(<LearningStyleCard data={varkData} />);

      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should render four progress bars', () => {
      render(<LearningStyleCard data={varkData} />);

      const progressBars = document.querySelectorAll('.bg-gray-100.rounded-full');
      expect(progressBars.length).toBeGreaterThanOrEqual(4);
    });

    it('should have four different colored progress bar fills', () => {
      render(<LearningStyleCard data={varkData} />);

      const skyBar = document.querySelector('.bg-sky-500');
      const emeraldBar = document.querySelector('.bg-emerald-500');
      const amberBar = document.querySelector('.bg-amber-500');
      const roseBar = document.querySelector('.bg-rose-500');

      expect(skyBar).toBeInTheDocument();
      expect(emeraldBar).toBeInTheDocument();
      expect(amberBar).toBeInTheDocument();
      expect(roseBar).toBeInTheDocument();
    });

    it('should display icons for each VARK dimension', () => {
      render(<LearningStyleCard data={varkData} />);

      expect(screen.getAllByTestId('eye-icon').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId('headphones-icon').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId('book-open-icon').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId('hand-icon').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==================== Model Label Tests ====================

  describe('model label', () => {
    it('should display AMAS VARK model label', () => {
      render(<LearningStyleCard />);
      expect(screen.getByText(/AMAS VARK 学习风格模型/)).toBeInTheDocument();
    });

    it('should display ML indicator when modelType is ml_sgd', () => {
      const mlData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.85,
        scores: { visual: 0.5, auditory: 0.2, reading: 0.2, kinesthetic: 0.1 },
        modelType: 'ml_sgd',
      };

      render(<LearningStyleCard data={mlData} />);
      expect(screen.getByText('(ML)')).toBeInTheDocument();
    });

    it('should not display ML indicator when modelType is rule_engine', () => {
      const ruleData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.85,
        scores: { visual: 0.5, auditory: 0.2, reading: 0.2, kinesthetic: 0.1 },
        modelType: 'rule_engine',
      };

      render(<LearningStyleCard data={ruleData} />);
      expect(screen.queryByText('(ML)')).not.toBeInTheDocument();
    });

    it('should not display ML indicator when modelType is undefined', () => {
      const noModelData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.85,
        scores: { visual: 0.5, auditory: 0.2, reading: 0.2, kinesthetic: 0.1 },
      };

      render(<LearningStyleCard data={noModelData} />);
      expect(screen.queryByText('(ML)')).not.toBeInTheDocument();
    });

    it('should style ML indicator with violet color', () => {
      const mlData: LearningStyleProfile = {
        style: 'auditory',
        confidence: 0.9,
        scores: { visual: 0.15, auditory: 0.6, reading: 0.15, kinesthetic: 0.1 },
        modelType: 'ml_sgd',
      };

      const { container } = render(<LearningStyleCard data={mlData} />);
      const mlIndicator = container.querySelector('.text-violet-500');
      expect(mlIndicator).toBeInTheDocument();
      expect(mlIndicator?.textContent).toBe('(ML)');
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
        scores: { visual: 0.7, auditory: 0.15, reading: 0.1, kinesthetic: 0.05 },
      };

      const { container } = render(<LearningStyleCard data={visualData} />);
      const iconContainer = container.querySelector('.bg-sky-50');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should have emerald color for auditory style', () => {
      const auditoryData: LearningStyleProfile = {
        style: 'auditory',
        confidence: 0.8,
        scores: { visual: 0.15, auditory: 0.7, reading: 0.1, kinesthetic: 0.05 },
      };

      const { container } = render(<LearningStyleCard data={auditoryData} />);
      const iconContainer = container.querySelector('.bg-emerald-50');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should have amber color for reading style', () => {
      const readingData: LearningStyleProfile = {
        style: 'reading',
        confidence: 0.8,
        scores: { visual: 0.1, auditory: 0.1, reading: 0.7, kinesthetic: 0.1 },
      };

      const { container } = render(<LearningStyleCard data={readingData} />);
      const iconContainer = container.querySelector('.bg-amber-50');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should have rose color for kinesthetic style', () => {
      const kinestheticData: LearningStyleProfile = {
        style: 'kinesthetic',
        confidence: 0.8,
        scores: { visual: 0.1, auditory: 0.1, reading: 0.1, kinesthetic: 0.7 },
      };

      const { container } = render(<LearningStyleCard data={kinestheticData} />);
      const iconContainer = container.querySelector('.bg-rose-50');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should have violet color for multimodal style', () => {
      const multimodalData: LearningStyleProfile = {
        style: 'multimodal',
        confidence: 0.8,
        scores: { visual: 0.26, auditory: 0.26, reading: 0.24, kinesthetic: 0.24 },
      };

      const { container } = render(<LearningStyleCard data={multimodalData} />);
      const iconContainer = container.querySelector('.bg-violet-50');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  // ==================== Progress Bar Colors Tests ====================

  describe('progress bar colors', () => {
    it('should have four different colors for VARK metric bars', () => {
      const testData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.8,
        scores: { visual: 0.45, auditory: 0.25, reading: 0.2, kinesthetic: 0.1 },
      };

      render(<LearningStyleCard data={testData} />);

      const skyBar = document.querySelector('.bg-sky-500');
      const emeraldBar = document.querySelector('.bg-emerald-500');
      const amberBar = document.querySelector('.bg-amber-500');
      const roseBar = document.querySelector('.bg-rose-500');

      expect(skyBar).toBeInTheDocument();
      expect(emeraldBar).toBeInTheDocument();
      expect(amberBar).toBeInTheDocument();
      expect(roseBar).toBeInTheDocument();
    });
  });

  // ==================== Relative Scaling Tests ====================

  describe('relative scaling', () => {
    it('should scale bars relative to max score for four dimensions', async () => {
      const testData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.8,
        scores: { visual: 0.8, auditory: 0.4, reading: 0.3, kinesthetic: 0.2 },
      };

      render(<LearningStyleCard data={testData} />);

      await waitFor(() => {
        const bars = document.querySelectorAll(
          '.rounded-full.bg-sky-500, .rounded-full.bg-emerald-500, .rounded-full.bg-amber-500, .rounded-full.bg-rose-500',
        );
        expect(bars.length).toBe(4);
      });
    });

    it('should handle all zero scores', () => {
      const testData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.8,
        scores: { visual: 0, auditory: 0, reading: 0, kinesthetic: 0 },
      };

      render(<LearningStyleCard data={testData} />);
      expect(screen.getByText('视觉型 (Visual)')).toBeInTheDocument();
    });

    it('should handle missing reading score gracefully', () => {
      const legacyData: LearningStyleProfile = {
        style: 'visual',
        confidence: 0.75,
        scores: { visual: 0.6, auditory: 0.3, kinesthetic: 0.1 },
      };

      render(<LearningStyleCard data={legacyData} />);

      // Reading should default to 0
      expect(screen.getByText('读写')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
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
