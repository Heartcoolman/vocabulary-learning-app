/**
 * Icon Component Unit Tests
 *
 * 测试图标模块的导出和re-export
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as Icons from '../Icon';

describe('Icon', () => {
  // ==================== Export Tests ====================

  describe('exports', () => {
    it('should export chart icons', () => {
      expect(Icons.ChartBar).toBeDefined();
      expect(Icons.ChartLine).toBeDefined();
      expect(Icons.ChartPie).toBeDefined();
    });

    it('should export navigation icons', () => {
      expect(Icons.ArrowLeft).toBeDefined();
      expect(Icons.ArrowRight).toBeDefined();
      expect(Icons.CaretLeft).toBeDefined();
      expect(Icons.CaretRight).toBeDefined();
      expect(Icons.CaretDown).toBeDefined();
      expect(Icons.CaretUp).toBeDefined();
    });

    it('should export status icons', () => {
      expect(Icons.Check).toBeDefined();
      expect(Icons.CheckCircle).toBeDefined();
      expect(Icons.X).toBeDefined();
      expect(Icons.XCircle).toBeDefined();
      expect(Icons.Warning).toBeDefined();
      expect(Icons.WarningCircle).toBeDefined();
    });

    it('should export learning icons', () => {
      expect(Icons.BookOpen).toBeDefined();
      expect(Icons.Books).toBeDefined();
      expect(Icons.Brain).toBeDefined();
      expect(Icons.Lightbulb).toBeDefined();
      expect(Icons.Trophy).toBeDefined();
    });

    it('should export action icons', () => {
      expect(Icons.Plus).toBeDefined();
      expect(Icons.Trash).toBeDefined();
      expect(Icons.Pencil).toBeDefined();
      expect(Icons.Gear).toBeDefined();
      expect(Icons.FloppyDisk).toBeDefined();
    });

    it('should export media icons', () => {
      expect(Icons.SpeakerHigh).toBeDefined();
      expect(Icons.Play).toBeDefined();
      expect(Icons.Pause).toBeDefined();
    });

    it('should export AMAS related icons', () => {
      expect(Icons.Coffee).toBeDefined();
      expect(Icons.PushPin).toBeDefined();
      expect(Icons.Question).toBeDefined();
      expect(Icons.Compass).toBeDefined();
      expect(Icons.Headphones).toBeDefined();
      expect(Icons.Hand).toBeDefined();
      expect(Icons.SunHorizon).toBeDefined();
    });

    it('should export AMAS enhanced icons', () => {
      expect(Icons.Sun).toBeDefined();
      expect(Icons.Moon).toBeDefined();
      expect(Icons.Medal).toBeDefined();
      expect(Icons.Crown).toBeDefined();
      expect(Icons.Lightning).toBeDefined();
      expect(Icons.Calendar).toBeDefined();
      expect(Icons.CalendarCheck).toBeDefined();
      expect(Icons.Percent).toBeDefined();
      expect(Icons.Timer).toBeDefined();
    });

    it('should export arrow icons', () => {
      expect(Icons.ArrowUp).toBeDefined();
      expect(Icons.ArrowDown).toBeDefined();
      expect(Icons.ArrowClockwise).toBeDefined();
      expect(Icons.ArrowCounterClockwise).toBeDefined();
    });

    it('should export user icons', () => {
      expect(Icons.User).toBeDefined();
      expect(Icons.UserCircle).toBeDefined();
      expect(Icons.UsersThree).toBeDefined();
    });

    it('should export file icons', () => {
      expect(Icons.File).toBeDefined();
      expect(Icons.FileText).toBeDefined();
    });

    it('should export misc icons', () => {
      expect(Icons.Target).toBeDefined();
      expect(Icons.Eye).toBeDefined();
      expect(Icons.Pulse).toBeDefined();
      expect(Icons.Globe).toBeDefined();
      expect(Icons.Clock).toBeDefined();
      expect(Icons.Star).toBeDefined();
      expect(Icons.Hash).toBeDefined();
      expect(Icons.MagnifyingGlass).toBeDefined();
      expect(Icons.CircleNotch).toBeDefined();
      expect(Icons.Note).toBeDefined();
      expect(Icons.ChatText).toBeDefined();
      expect(Icons.ListNumbers).toBeDefined();
      expect(Icons.Confetti).toBeDefined();
      expect(Icons.Fire).toBeDefined();
      expect(Icons.Lock).toBeDefined();
      expect(Icons.Bell).toBeDefined();
      expect(Icons.Funnel).toBeDefined();
    });

    it('should export sort icons', () => {
      expect(Icons.SortAscending).toBeDefined();
      expect(Icons.SortDescending).toBeDefined();
    });

    it('should export trend icons', () => {
      expect(Icons.TrendUp).toBeDefined();
      expect(Icons.TrendDown).toBeDefined();
    });

    it('should export info icons', () => {
      expect(Icons.Info).toBeDefined();
      expect(Icons.Minus).toBeDefined();
    });

    it('should export AMAS public display icons', () => {
      expect(Icons.SlidersHorizontal).toBeDefined();
      expect(Icons.SignIn).toBeDefined();
      expect(Icons.Cpu).toBeDefined();
      expect(Icons.Graph).toBeDefined();
      expect(Icons.Atom).toBeDefined();
      expect(Icons.Robot).toBeDefined();
      expect(Icons.Shuffle).toBeDefined();
      expect(Icons.Flask).toBeDefined();
      expect(Icons.ShareNetwork).toBeDefined();
      expect(Icons.GitBranch).toBeDefined();
      expect(Icons.IdentificationBadge).toBeDefined();
      expect(Icons.Database).toBeDefined();
      expect(Icons.List).toBeDefined();
      expect(Icons.Bug).toBeDefined();
      expect(Icons.Desktop).toBeDefined();
      expect(Icons.DeviceMobile).toBeDefined();
    });

    it('should export admin page icons', () => {
      expect(Icons.UploadSimple).toBeDefined();
      expect(Icons.NotePencil).toBeDefined();
      expect(Icons.ArrowsClockwise).toBeDefined();
      expect(Icons.Scales).toBeDefined();
      expect(Icons.DownloadSimple).toBeDefined();
      expect(Icons.PencilSimple).toBeDefined();
      expect(Icons.DotsThreeVertical).toBeDefined();
    });

    it('should export LLM advisor icons', () => {
      expect(Icons.ShieldCheck).toBeDefined();
    });

    it('should export SSE connection icons', () => {
      expect(Icons.WifiHigh).toBeDefined();
      expect(Icons.WifiSlash).toBeDefined();
    });
  });

  // ==================== Alias Tests ====================

  describe('aliases', () => {
    it('should export Sliders alias for SlidersHorizontal', () => {
      expect(Icons.Sliders).toBeDefined();
      expect(Icons.Sliders).toBe(Icons.SlidersHorizontal);
    });

    it('should export UserFocus alias for User', () => {
      expect(Icons.UserFocus).toBeDefined();
      expect(Icons.UserFocus).toBe(Icons.User);
    });

    it('should export Activity alias for Pulse', () => {
      expect(Icons.Activity).toBeDefined();
      expect(Icons.Activity).toBe(Icons.Pulse);
    });

    it('should export Users alias for UsersThree', () => {
      expect(Icons.Users).toBeDefined();
      expect(Icons.Users).toBe(Icons.UsersThree);
    });

    it('should export Shield alias for ShieldCheck', () => {
      expect(Icons.Shield).toBeDefined();
      expect(Icons.Shield).toBe(Icons.ShieldCheck);
    });
  });

  // ==================== System Status Icons ====================

  describe('system status icons', () => {
    it('should export Gauge icon', () => {
      expect(Icons.Gauge).toBeDefined();
    });

    it('should export Toggle icons', () => {
      expect(Icons.ToggleLeft).toBeDefined();
      expect(Icons.ToggleRight).toBeDefined();
    });
  });

  // ==================== Component Type Tests ====================

  describe('component types', () => {
    it('should export React components', () => {
      // All icons should be defined (either as functions or objects for React components)
      expect(Icons.ChartBar).toBeDefined();
      expect(Icons.Check).toBeDefined();
      expect(Icons.Brain).toBeDefined();
    });

    it('should be renderable as React components', () => {
      // Test that icons can be rendered
      const { container: container1 } = render(<Icons.ChartBar />);
      expect(container1.querySelector('svg')).toBeInTheDocument();

      const { container: container2 } = render(<Icons.Check />);
      expect(container2.querySelector('svg')).toBeInTheDocument();

      const { container: container3 } = render(<Icons.Brain />);
      expect(container3.querySelector('svg')).toBeInTheDocument();
    });
  });
});
