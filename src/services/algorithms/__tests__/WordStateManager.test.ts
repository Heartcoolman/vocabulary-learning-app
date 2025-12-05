/**
 * WordStateManager Tests
 */

import { describe, it } from 'vitest';

describe('WordStateManager', () => {
  describe('getState', () => {
    it.todo('should return word state');

    it.todo('should return default for new word');
  });

  describe('updateState', () => {
    it.todo('should update on correct answer');

    it.todo('should update on incorrect answer');
  });

  describe('state transitions', () => {
    it.todo('should transition from new to learning');

    it.todo('should transition from learning to mastered');

    it.todo('should transition from mastered to learning on failure');
  });

  describe('interval calculation', () => {
    it.todo('should calculate next review interval');
  });
});
