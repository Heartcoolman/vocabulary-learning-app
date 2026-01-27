import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import AchievementPage from '../AchievementPage';

describe('AchievementPage', () => {
  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <AchievementPage />
      </MemoryRouter>,
    );
  };

  describe('Rendering', () => {
    it('should render feature upgrading placeholder', () => {
      renderComponent();

      expect(screen.getByText('功能升级中')).toBeInTheDocument();
    });

    it('should show version info', () => {
      renderComponent();

      expect(screen.getByText(/v1\.8\.0/)).toBeInTheDocument();
    });
  });
});
