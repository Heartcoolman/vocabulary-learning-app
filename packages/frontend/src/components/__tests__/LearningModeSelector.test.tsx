/**
 * LearningModeSelector Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LearningModeSelector } from '../LearningModeSelector';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock phosphor icons
vi.mock('@phosphor-icons/react', () => ({
  GraduationCap: () => <span data-testid="graduation-icon">GraduationCap</span>,
  Lightning: () => <span data-testid="lightning-icon">Lightning</span>,
  Coffee: () => <span data-testid="coffee-icon">Coffee</span>,
}));

// Mock ApiClient - 需要与组件中导入的路径一致
vi.mock('../../services/client', () => ({
  default: {
    getUserRewardProfile: vi.fn(),
    updateUserRewardProfile: vi.fn(),
  },
}));

import ApiClient from '../../services/client';
const mockApiClient = ApiClient;

// Mock useToast
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock('../ui', () => ({
  useToast: () => mockToast,
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  uiLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockModes = [
  { id: 'standard', name: '标准模式', description: '平衡学习节奏' },
  { id: 'cram', name: '冲刺模式', description: '高强度学习' },
  { id: 'relaxed', name: '休闲模式', description: '轻松学习' },
];

describe('LearningModeSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockApiClient.getUserRewardProfile).mockResolvedValue({
      currentProfile: 'standard',
      availableProfiles: mockModes,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ==================== Rendering Tests ====================

  describe('rendering', () => {
    it('should render selector button', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });
    });

    it('should display current mode icon', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByTestId('graduation-icon')).toBeInTheDocument();
      });
    });

    it('should display mode name when not minimal', async () => {
      render(<LearningModeSelector minimal={false} />);

      await waitFor(() => {
        expect(screen.getByText('标准模式')).toBeInTheDocument();
      });
    });

    it('should hide mode name when minimal', async () => {
      render(<LearningModeSelector minimal={true} />);

      await waitFor(() => {
        expect(screen.queryByText('模式')).not.toBeInTheDocument();
      });
    });
  });

  // ==================== Dropdown Tests ====================

  describe('dropdown', () => {
    it('should show dropdown on button click', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      const button = screen.getByLabelText('选择学习模式');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('选择学习模式')).toBeInTheDocument();
      });
    });

    it('should display all available modes when dropdown is open', async () => {
      render(<LearningModeSelector />);

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      // Click to open dropdown
      const button = screen.getByLabelText('选择学习模式');
      fireEvent.click(button);

      // Check that modes are displayed - use getAllByText since dropdown heading may duplicate
      await waitFor(() => {
        expect(screen.getAllByText('标准模式').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('冲刺模式')).toBeInTheDocument();
        expect(screen.getByText('休闲模式')).toBeInTheDocument();
      });
    });

    it('should display mode descriptions', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      const button = screen.getByLabelText('选择学习模式');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('平衡学习节奏')).toBeInTheDocument();
        expect(screen.getByText('高强度学习')).toBeInTheDocument();
        expect(screen.getByText('轻松学习')).toBeInTheDocument();
      });
    });

    it('should highlight current mode', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      const button = screen.getByLabelText('选择学习模式');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('当前')).toBeInTheDocument();
      });
    });

    it('should render dropdown container when opened', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      const button = screen.getByLabelText('选择学习模式');
      fireEvent.click(button);

      // Check that dropdown content is visible
      await waitFor(() => {
        expect(screen.getByText('冲刺模式')).toBeInTheDocument();
      });
    });
  });

  // ==================== Mode Selection Tests ====================

  describe('mode selection', () => {
    it('should handle clicking on current mode', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      const button = screen.getByLabelText('选择学习模式');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('冲刺模式')).toBeInTheDocument();
      });

      // Click on current mode button
      const modeButtons = screen.getAllByRole('button');
      const standardButton = modeButtons.find(
        (btn) => btn.textContent?.includes('标准模式') && btn.textContent?.includes('当前'),
      );
      if (standardButton) {
        fireEvent.click(standardButton);
      }

      // API should not be called for same mode
      expect(vi.mocked(mockApiClient.updateUserRewardProfile)).not.toHaveBeenCalled();
    });

    it('should update mode when selecting different mode', async () => {
      vi.mocked(mockApiClient.updateUserRewardProfile).mockResolvedValue({
        currentProfile: 'cram',
        message: 'Profile updated successfully',
      });

      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      const button = screen.getByLabelText('选择学习模式');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('冲刺模式')).toBeInTheDocument();
      });

      const cramButton = screen
        .getAllByRole('button')
        .find((btn) => btn.textContent?.includes('冲刺模式') && !btn.textContent?.includes('当前'));
      if (cramButton) {
        fireEvent.click(cramButton);
      }

      await waitFor(() => {
        expect(vi.mocked(mockApiClient.updateUserRewardProfile)).toHaveBeenCalledWith('cram');
      });
    });

    it('should show error toast when update fails', async () => {
      vi.mocked(mockApiClient.updateUserRewardProfile).mockRejectedValue(
        new Error('Update failed'),
      );

      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      const button = screen.getByLabelText('选择学习模式');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('冲刺模式')).toBeInTheDocument();
      });

      const cramButton = screen
        .getAllByRole('button')
        .find((btn) => btn.textContent?.includes('冲刺模式') && !btn.textContent?.includes('当前'));
      if (cramButton) {
        fireEvent.click(cramButton);
      }

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('切换学习模式失败，请重试');
      });
    });

    it('should call API when selecting different mode', async () => {
      vi.mocked(mockApiClient.updateUserRewardProfile).mockResolvedValue({
        currentProfile: 'relaxed',
        message: 'Profile updated successfully',
      });

      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      const button = screen.getByLabelText('选择学习模式');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('休闲模式')).toBeInTheDocument();
      });

      const relaxedButton = screen
        .getAllByRole('button')
        .find((btn) => btn.textContent?.includes('休闲模式'));
      if (relaxedButton) {
        fireEvent.click(relaxedButton);
      }

      await waitFor(() => {
        expect(vi.mocked(mockApiClient.updateUserRewardProfile)).toHaveBeenCalled();
      });
    });

    it('should show loading text while updating', async () => {
      // Create a promise that we control
      let resolveUpdate: () => void;
      vi.mocked(mockApiClient.updateUserRewardProfile).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpdate = () =>
              resolve({ currentProfile: 'cram', message: 'Profile updated successfully' });
          }),
      );

      render(<LearningModeSelector />);

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      // Open dropdown
      const button = screen.getByLabelText('选择学习模式');
      fireEvent.click(button);

      // Wait for dropdown options
      await waitFor(() => {
        expect(screen.getByText('冲刺模式')).toBeInTheDocument();
      });

      // Click on cram mode
      const cramButton = screen
        .getAllByRole('button')
        .find((btn) => btn.textContent?.includes('冲刺模式') && !btn.textContent?.includes('当前'));
      if (cramButton) {
        fireEvent.click(cramButton);
      }

      // Check for loading state - this should appear immediately after click
      await waitFor(() => {
        expect(screen.getByText('正在切换模式...')).toBeInTheDocument();
      });

      // Clean up by resolving the promise
      resolveUpdate!();
    });
  });

  // ==================== Icon Tests ====================

  describe('icons', () => {
    it('should show graduation icon for standard mode', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByTestId('graduation-icon')).toBeInTheDocument();
      });
    });

    it('should show lightning icon for cram mode', async () => {
      vi.mocked(mockApiClient.getUserRewardProfile).mockResolvedValue({
        currentProfile: 'cram',
        availableProfiles: mockModes,
      });

      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByTestId('lightning-icon')).toBeInTheDocument();
      });
    });

    it('should show coffee icon for relaxed mode', async () => {
      vi.mocked(mockApiClient.getUserRewardProfile).mockResolvedValue({
        currentProfile: 'relaxed',
        availableProfiles: mockModes,
      });

      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByTestId('coffee-icon')).toBeInTheDocument();
      });
    });
  });

  // ==================== Accessibility Tests ====================

  describe('accessibility', () => {
    it('should have aria-label on button', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });
    });

    it('should have title attribute', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        const button = screen.getByLabelText('选择学习模式');
        expect(button).toHaveAttribute('title', '切换学习模式');
      });
    });

    it('should have aria-hidden on backdrop', async () => {
      render(<LearningModeSelector />);

      await waitFor(() => {
        const button = screen.getByLabelText('选择学习模式');
        fireEvent.click(button);
      });

      await waitFor(() => {
        const backdrop = document.querySelector('[aria-hidden="true"]');
        expect(backdrop).toBeInTheDocument();
      });
    });
  });

  // ==================== Cleanup Tests ====================

  describe('cleanup', () => {
    it('should cleanup on unmount', async () => {
      const { unmount } = render(<LearningModeSelector />);

      await waitFor(() => {
        expect(screen.getByLabelText('选择学习模式')).toBeInTheDocument();
      });

      unmount();

      // No errors should occur
      expect(true).toBe(true);
    });
  });
});
