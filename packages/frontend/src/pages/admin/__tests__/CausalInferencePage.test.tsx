/**
 * CausalInferencePage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Use vi.hoisted to create mock functions that can be used in vi.mock factories
const {
  mockGetCausalATE,
  mockGetCausalDiagnostics,
  mockRecordCausalObservation,
  mockCompareStrategies,
} = vi.hoisted(() => ({
  mockGetCausalATE: vi.fn(),
  mockGetCausalDiagnostics: vi.fn(),
  mockRecordCausalObservation: vi.fn(),
  mockCompareStrategies: vi.fn(),
}));

// Mock useToast hook
vi.mock('../../../components/ui', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

// Mock ApiClient
vi.mock('../../../services/client', () => ({
  default: {
    getCausalATE: mockGetCausalATE,
    getCausalDiagnostics: mockGetCausalDiagnostics,
    recordCausalObservation: mockRecordCausalObservation,
    compareStrategies: mockCompareStrategies,
  },
}));

// Mock Icon components
vi.mock('../../../components/Icon', () => ({
  CircleNotch: ({ className }: { className?: string }) => (
    <span data-testid="loading-spinner" className={className}>
      Loading
    </span>
  ),
  Warning: () => <span data-testid="warning-icon">Warning</span>,
  CheckCircle: () => <span data-testid="check-icon">Check</span>,
  ChartBar: () => <span data-testid="chart-icon">Chart</span>,
  Brain: () => <span data-testid="brain-icon">Brain</span>,
  Lightbulb: () => <span data-testid="lightbulb-icon">Lightbulb</span>,
  ArrowClockwise: () => <span data-testid="refresh-icon">Refresh</span>,
  FileText: () => <span data-testid="file-icon">File</span>,
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  adminLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Import after mocks are set up
import CausalInferencePage from '../CausalInferencePage';

const mockATE = {
  ate: 0.15,
  standardError: 0.05,
  confidenceInterval: [0.05, 0.25] as [number, number],
  sampleSize: 100,
  effectiveSampleSize: 85,
  pValue: 0.01,
  significant: true,
};

const mockDiagnostics = {
  mean: 0.5,
  std: 0.2,
  median: 0.48,
  treatmentMean: 0.65,
  controlMean: 0.35,
  overlap: 0.85,
  auc: 0.72,
};

const renderWithRouter = () => {
  return render(
    <MemoryRouter>
      <CausalInferencePage />
    </MemoryRouter>,
  );
};

describe('CausalInferencePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCausalATE.mockResolvedValue(mockATE);
    mockGetCausalDiagnostics.mockResolvedValue(mockDiagnostics);
  });

  describe('rendering', () => {
    it('should render page title', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('因果分析')).toBeInTheDocument();
      });
    });

    it('should render page description', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('记录和分析学习策略的因果效应')).toBeInTheDocument();
      });
    });
  });

  describe('observation form', () => {
    it('should render observation form', async () => {
      renderWithRouter();

      await waitFor(() => {
        // Use getAllByText since "记录观测" appears as both heading and button text
        expect(screen.getAllByText('记录观测').length).toBeGreaterThan(0);
      });
    });

    it('should have features input field', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('例如: 0.5, 0.8, 0.3')).toBeInTheDocument();
      });
    });

    it('should have strategy selector', async () => {
      renderWithRouter();

      await waitFor(() => {
        // Check for label text (getAllByText since it may appear in multiple places)
        expect(screen.getAllByText(/策略选择/).length).toBeGreaterThan(0);
        expect(screen.getByText('策略 A (对照组)')).toBeInTheDocument();
      });
    });

    it('should have outcome input', async () => {
      renderWithRouter();

      await waitFor(() => {
        // Use more specific placeholder to match only the outcome input (not the features textarea)
        expect(screen.getByPlaceholderText('例如: 0.5')).toBeInTheDocument();
      });
    });

    it('should record observation on submit', async () => {
      mockRecordCausalObservation.mockResolvedValue({});

      renderWithRouter();

      await waitFor(() => {
        // Wait for form to render
        expect(screen.getByPlaceholderText('例如: 0.5, 0.8, 0.3')).toBeInTheDocument();
      });

      // Fill form - use exact placeholder strings to avoid matching multiple elements
      const featuresInput = screen.getByPlaceholderText('例如: 0.5, 0.8, 0.3');
      const outcomeInput = screen.getByPlaceholderText('例如: 0.5');

      fireEvent.change(featuresInput, { target: { value: '0.5, 0.8, 0.3' } });
      fireEvent.change(outcomeInput, { target: { value: '0.7' } });

      // Submit form
      const submitButton = screen.getByRole('button', { name: /记录观测/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockRecordCausalObservation).toHaveBeenCalled();
      });
    });
  });

  describe('ATE section', () => {
    it('should render ATE section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('平均处理效应 (ATE)')).toBeInTheDocument();
      });
    });

    it('should display ATE value', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('0.1500')).toBeInTheDocument();
      });
    });

    it('should display standard error', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('标准误')).toBeInTheDocument();
        expect(screen.getByText('0.0500')).toBeInTheDocument();
      });
    });

    it('should display confidence interval', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('95% 置信区间')).toBeInTheDocument();
        expect(screen.getByText(/0.0500.*0.2500/)).toBeInTheDocument();
      });
    });

    it('should display sample size', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('样本量')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument();
      });
    });

    it('should display significance status', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('效应显著 (α=0.05)')).toBeInTheDocument();
      });
    });
  });

  describe('diagnostics section', () => {
    it('should render diagnostics section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('倾向得分诊断')).toBeInTheDocument();
      });
    });

    it('should display mean propensity score', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('平均倾向得分')).toBeInTheDocument();
        expect(screen.getByText('0.5000')).toBeInTheDocument();
      });
    });

    it('should display treatment and control means', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('处理组平均')).toBeInTheDocument();
        expect(screen.getByText('0.6500')).toBeInTheDocument();
        expect(screen.getByText('对照组平均')).toBeInTheDocument();
        expect(screen.getByText('0.3500')).toBeInTheDocument();
      });
    });

    it('should display overlap', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('样本重叠度')).toBeInTheDocument();
        expect(screen.getByText('85.00%')).toBeInTheDocument();
      });
    });
  });

  describe('strategy comparison', () => {
    it('should render comparison section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('策略对比 (策略B vs 策略A)')).toBeInTheDocument();
      });
    });

    it('should have compare button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('执行对比分析')).toBeInTheDocument();
      });
    });

    it('should run comparison on button click', async () => {
      mockCompareStrategies.mockResolvedValue({
        difference: 0.1,
        standardError: 0.03,
        confidenceInterval: [0.04, 0.16],
        pValue: 0.02,
        significant: true,
        sampleSize: 100,
      });

      renderWithRouter();

      await waitFor(() => {
        const compareButton = screen.getByText('执行对比分析');
        fireEvent.click(compareButton);
      });

      await waitFor(() => {
        expect(mockCompareStrategies).toHaveBeenCalledWith(1, 0);
      });
    });
  });

  describe('export functionality', () => {
    it('should have export button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('导出分析数据')).toBeInTheDocument();
      });
    });

    it('should export data on button click', async () => {
      const mockCreateObjectURL = vi.fn(() => 'blob:url');
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      renderWithRouter();

      await waitFor(() => {
        const exportButton = screen.getByText('导出分析数据');
        fireEvent.click(exportButton);
      });

      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should show error when ATE API fails', async () => {
      mockGetCausalATE.mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('warning-icon').length).toBeGreaterThan(0);
      });
    });

    it('should show error when diagnostics API fails', async () => {
      mockGetCausalDiagnostics.mockRejectedValue(new Error('API Error'));

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getAllByTestId('warning-icon').length).toBeGreaterThan(0);
      });
    });
  });

  describe('info section', () => {
    it('should render explanation section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('因果分析说明')).toBeInTheDocument();
      });
    });

    it('should explain key concepts', async () => {
      renderWithRouter();

      await waitFor(() => {
        // These texts appear in multiple places, use getAllByText
        expect(screen.getAllByText(/特征向量/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/策略选择/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/奖励值/).length).toBeGreaterThan(0);
      });
    });
  });
});
