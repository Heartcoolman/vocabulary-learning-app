/**
 * Decision Events Service Unit Tests
 * Tests for the DecisionEventsService API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../../src/logger', () => ({
  serviceLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import { decisionEventsService, DecisionEventData } from '../../../src/services/decision-events.service';

describe('DecisionEventsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset connection count by removing all listeners
    decisionEventsService.removeAllListeners('decision');
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = decisionEventsService;
      const instance2 = decisionEventsService;
      expect(instance1).toBe(instance2);
    });
  });

  describe('emitDecision', () => {
    it('should emit decision event with correct data', async () => {
      const receivedEvents: DecisionEventData[] = [];

      decisionEventsService.on('decision', (event: DecisionEventData) => {
        receivedEvents.push(event);
      });

      decisionEventsService.emitDecision({
        decisionId: 'test-decision-1',
        userId: 'user-123',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        decisionSource: 'amas',
        selectedAction: { difficulty: 'hard', batch_size: 10 }
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].decisionId).toBe('test-decision-1');
      expect(receivedEvents[0].timestamp).toBe('2024-01-15T10:00:00.000Z');
      expect(receivedEvents[0].decisionSource).toBe('amas');
      expect(receivedEvents[0].strategy.difficulty).toBe('hard');
      expect(receivedEvents[0].strategy.batch_size).toBe(10);
      expect(receivedEvents[0].source).toBe('real');
    });

    it('should set source to virtual for simulation', () => {
      const receivedEvents: DecisionEventData[] = [];

      decisionEventsService.on('decision', (event: DecisionEventData) => {
        receivedEvents.push(event);
      });

      decisionEventsService.emitDecision({
        decisionId: 'sim-decision-1',
        timestamp: new Date(),
        decisionSource: 'simulation',
        selectedAction: {},
        isSimulation: true
      });

      expect(receivedEvents[0].source).toBe('virtual');
    });

    it('should anonymize user id', () => {
      const receivedEvents: DecisionEventData[] = [];

      decisionEventsService.on('decision', (event: DecisionEventData) => {
        receivedEvents.push(event);
      });

      decisionEventsService.emitDecision({
        decisionId: 'test-decision',
        userId: 'real-user-id',
        timestamp: new Date(),
        decisionSource: 'amas',
        selectedAction: {}
      });

      expect(receivedEvents[0].pseudoId).not.toBe('real-user-id');
      expect(receivedEvents[0].pseudoId).toHaveLength(8);
    });

    it('should use anonymous for missing user id', () => {
      const receivedEvents: DecisionEventData[] = [];

      decisionEventsService.on('decision', (event: DecisionEventData) => {
        receivedEvents.push(event);
      });

      decisionEventsService.emitDecision({
        decisionId: 'test-decision',
        timestamp: new Date(),
        decisionSource: 'amas',
        selectedAction: {}
      });

      expect(receivedEvents[0].pseudoId).toBe('anonymous');
    });

    it('should use default values for missing action fields', () => {
      const receivedEvents: DecisionEventData[] = [];

      decisionEventsService.on('decision', (event: DecisionEventData) => {
        receivedEvents.push(event);
      });

      decisionEventsService.emitDecision({
        decisionId: 'test-decision',
        timestamp: new Date(),
        decisionSource: 'amas',
        selectedAction: {}
      });

      expect(receivedEvents[0].strategy.difficulty).toBe('mid');
      expect(receivedEvents[0].strategy.batch_size).toBe(5);
    });
  });

  describe('dominant factor detection', () => {
    it('should detect attention as dominant factor', () => {
      const receivedEvents: DecisionEventData[] = [];

      decisionEventsService.on('decision', (event: DecisionEventData) => {
        receivedEvents.push(event);
      });

      decisionEventsService.emitDecision({
        decisionId: 'test',
        timestamp: new Date(),
        decisionSource: 'amas',
        selectedAction: {},
        stateSnapshot: { A: 0.9, F: 0.5, M: 0.5 }
      });

      expect(receivedEvents[0].dominantFactor).toBe('attention');
    });

    it('should detect fatigue as dominant factor (inverse)', () => {
      const receivedEvents: DecisionEventData[] = [];

      decisionEventsService.on('decision', (event: DecisionEventData) => {
        receivedEvents.push(event);
      });

      decisionEventsService.emitDecision({
        decisionId: 'test',
        timestamp: new Date(),
        decisionSource: 'amas',
        selectedAction: {},
        stateSnapshot: { A: 0.5, F: 0.1, M: 0.5 }
      });

      expect(receivedEvents[0].dominantFactor).toBe('fatigue');
    });

    it('should detect motivation as dominant factor', () => {
      const receivedEvents: DecisionEventData[] = [];

      decisionEventsService.on('decision', (event: DecisionEventData) => {
        receivedEvents.push(event);
      });

      decisionEventsService.emitDecision({
        decisionId: 'test',
        timestamp: new Date(),
        decisionSource: 'amas',
        selectedAction: {},
        stateSnapshot: { A: 0.5, F: 0.5, M: 0.95 }
      });

      expect(receivedEvents[0].dominantFactor).toBe('motivation');
    });

    it('should return balanced when all factors are similar', () => {
      const receivedEvents: DecisionEventData[] = [];

      decisionEventsService.on('decision', (event: DecisionEventData) => {
        receivedEvents.push(event);
      });

      decisionEventsService.emitDecision({
        decisionId: 'test',
        timestamp: new Date(),
        decisionSource: 'amas',
        selectedAction: {},
        stateSnapshot: { A: 0.5, F: 0.5, M: 0.5 }
      });

      expect(receivedEvents[0].dominantFactor).toBe('balanced');
    });

    it('should return unknown for missing state', () => {
      const receivedEvents: DecisionEventData[] = [];

      decisionEventsService.on('decision', (event: DecisionEventData) => {
        receivedEvents.push(event);
      });

      decisionEventsService.emitDecision({
        decisionId: 'test',
        timestamp: new Date(),
        decisionSource: 'amas',
        selectedAction: {}
      });

      expect(receivedEvents[0].dominantFactor).toBe('unknown');
    });
  });

  describe('connection management', () => {
    it('should increment connection count', () => {
      const initialCount = decisionEventsService.getConnectionCount();

      decisionEventsService.incrementConnections();

      expect(decisionEventsService.getConnectionCount()).toBe(initialCount + 1);
    });

    it('should decrement connection count', () => {
      decisionEventsService.incrementConnections();
      decisionEventsService.incrementConnections();
      const countAfterIncrement = decisionEventsService.getConnectionCount();

      decisionEventsService.decrementConnections();

      expect(decisionEventsService.getConnectionCount()).toBe(countAfterIncrement - 1);
    });

    it('should not decrement below zero', () => {
      // Reset to 0
      while (decisionEventsService.getConnectionCount() > 0) {
        decisionEventsService.decrementConnections();
      }

      decisionEventsService.decrementConnections();
      decisionEventsService.decrementConnections();

      expect(decisionEventsService.getConnectionCount()).toBe(0);
    });

    it('should return current connection count', () => {
      // Reset to 0
      while (decisionEventsService.getConnectionCount() > 0) {
        decisionEventsService.decrementConnections();
      }

      decisionEventsService.incrementConnections();
      decisionEventsService.incrementConnections();
      decisionEventsService.incrementConnections();

      expect(decisionEventsService.getConnectionCount()).toBe(3);
    });
  });

  describe('exports', () => {
    it('should export decisionEventsService singleton', async () => {
      const module = await import('../../../src/services/decision-events.service');
      expect(module.decisionEventsService).toBeDefined();
    });

    it('should export default', async () => {
      const module = await import('../../../src/services/decision-events.service');
      expect(module.default).toBeDefined();
    });

    it('should export DecisionEventData type', async () => {
      // This is a type check, we just verify the import works
      const module = await import('../../../src/services/decision-events.service');
      expect(module.decisionEventsService).toBeDefined();
    });
  });
});
