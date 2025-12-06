import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import AboutLayout from '../AboutLayout';

describe('AboutLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (initialRoute = '/about') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/about/*" element={<AboutLayout />}>
            <Route index element={<div>About Home Content</div>} />
            <Route path="simulation" element={<div>Simulation Content</div>} />
            <Route path="dashboard" element={<div>Dashboard Content</div>} />
            <Route path="stats" element={<div>Stats Content</div>} />
            <Route path="system-status" element={<div>System Status Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Rendering', () => {
    it('should render sidebar', () => {
      renderComponent();
      expect(screen.getByText('AMAS')).toBeInTheDocument();
      expect(screen.getByText('智能学习引擎')).toBeInTheDocument();
    });

    it('should render all navigation links', () => {
      renderComponent();
      expect(screen.getByText('概览')).toBeInTheDocument();
      expect(screen.getByText('模拟演示')).toBeInTheDocument();
      expect(screen.getByText('实时仪表盘')).toBeInTheDocument();
      expect(screen.getByText('统计大屏')).toBeInTheDocument();
      expect(screen.getByText('系统状态')).toBeInTheDocument();
    });

    it('should render login button', () => {
      renderComponent();
      expect(screen.getByText('开始学习')).toBeInTheDocument();
    });

    it('should render login hint text', () => {
      renderComponent();
      expect(screen.getByText('登录后体验完整功能')).toBeInTheDocument();
    });

    it('should render outlet content', () => {
      renderComponent();
      expect(screen.getByText('About Home Content')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should highlight active link for about home', () => {
      renderComponent('/about');
      const overviewLink = screen.getByText('概览').closest('a');
      expect(overviewLink).toHaveClass('bg-gradient-to-r');
    });

    it('should render correct content for simulation route', () => {
      renderComponent('/about/simulation');
      expect(screen.getByText('Simulation Content')).toBeInTheDocument();
    });

    it('should render correct content for dashboard route', () => {
      renderComponent('/about/dashboard');
      expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
    });

    it('should render correct content for stats route', () => {
      renderComponent('/about/stats');
      expect(screen.getByText('Stats Content')).toBeInTheDocument();
    });

    it('should render correct content for system-status route', () => {
      renderComponent('/about/system-status');
      expect(screen.getByText('System Status Content')).toBeInTheDocument();
    });
  });

  describe('Navigation Links', () => {
    it('should have correct href for overview link', () => {
      renderComponent();
      const overviewLink = screen.getByText('概览').closest('a');
      expect(overviewLink).toHaveAttribute('href', '/about');
    });

    it('should have correct href for simulation link', () => {
      renderComponent();
      const simulationLink = screen.getByText('模拟演示').closest('a');
      expect(simulationLink).toHaveAttribute('href', '/about/simulation');
    });

    it('should have correct href for dashboard link', () => {
      renderComponent();
      const dashboardLink = screen.getByText('实时仪表盘').closest('a');
      expect(dashboardLink).toHaveAttribute('href', '/about/dashboard');
    });

    it('should have correct href for stats link', () => {
      renderComponent();
      const statsLink = screen.getByText('统计大屏').closest('a');
      expect(statsLink).toHaveAttribute('href', '/about/stats');
    });

    it('should have correct href for system-status link', () => {
      renderComponent();
      const systemStatusLink = screen.getByText('系统状态').closest('a');
      expect(systemStatusLink).toHaveAttribute('href', '/about/system-status');
    });

    it('should have correct href for login link', () => {
      renderComponent();
      const loginLink = screen.getByText('开始学习').closest('a');
      expect(loginLink).toHaveAttribute('href', '/login');
    });
  });

  describe('Layout Structure', () => {
    it('should have sidebar and main content area', () => {
      renderComponent();

      // Sidebar should contain navigation
      expect(screen.getByText('概览')).toBeInTheDocument();

      // Main content should contain outlet content
      expect(screen.getByText('About Home Content')).toBeInTheDocument();
    });

    it('should have correct sidebar width', () => {
      renderComponent();

      // The sidebar should have w-64 class
      const sidebar = screen.getByText('AMAS').closest('aside');
      expect(sidebar).toHaveClass('w-64');
    });
  });

  describe('Logo and Branding', () => {
    it('should display AMAS logo section', () => {
      renderComponent();

      expect(screen.getByText('AMAS')).toBeInTheDocument();
      expect(screen.getByText('智能学习引擎')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible navigation structure', () => {
      renderComponent();

      // All navigation links should be accessible
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
    });

    it('should have main content area', () => {
      renderComponent();

      const main = document.querySelector('main');
      expect(main).toBeInTheDocument();
    });
  });
});
