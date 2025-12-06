import { describe, it, expect } from 'vitest';
import {
  toCompactState,
  toExpandedState,
  UserStateFrontend,
  UserStateBackend,
} from '../utils/state-converter';

describe('state-converter', () => {
  // ============ toCompactState() 测试 ============

  describe('toCompactState', () => {
    it('should convert complete frontend state to compact format', () => {
      const frontend: UserStateFrontend = {
        attention: 0.8,
        fatigue: 0.3,
        motivation: 0.9,
        memory: 0.7,
        speed: 0.6,
        stability: 0.85,
        confidence: 0.75,
        timestamp: 1701849600000,
      };

      const result = toCompactState(frontend);

      expect(result).toEqual({
        A: 0.8,
        F: 0.3,
        M: 0.9,
        C: {
          mem: 0.7,
          speed: 0.6,
          stability: 0.85,
        },
        conf: 0.75,
        ts: 1701849600000,
      });
    });

    it('should handle state without optional fields', () => {
      const frontend: UserStateFrontend = {
        attention: 0.5,
        fatigue: 0.5,
        motivation: 0.5,
        memory: 0.5,
        speed: 0.5,
        stability: 0.5,
      };

      const result = toCompactState(frontend);

      expect(result.A).toBe(0.5);
      expect(result.F).toBe(0.5);
      expect(result.M).toBe(0.5);
      expect(result.C.mem).toBe(0.5);
      expect(result.C.speed).toBe(0.5);
      expect(result.C.stability).toBe(0.5);
      expect(result.conf).toBeUndefined();
      expect(result.ts).toBeUndefined();
    });

    it('should handle edge case values', () => {
      const frontend: UserStateFrontend = {
        attention: 0,
        fatigue: 1,
        motivation: 0,
        memory: 1,
        speed: 0,
        stability: 1,
      };

      const result = toCompactState(frontend);

      expect(result.A).toBe(0);
      expect(result.F).toBe(1);
      expect(result.M).toBe(0);
      expect(result.C.mem).toBe(1);
      expect(result.C.speed).toBe(0);
      expect(result.C.stability).toBe(1);
    });

    it('should handle negative values', () => {
      const frontend: UserStateFrontend = {
        attention: -0.5,
        fatigue: -0.3,
        motivation: -0.1,
        memory: -0.2,
        speed: -0.4,
        stability: -0.6,
      };

      const result = toCompactState(frontend);

      expect(result.A).toBe(-0.5);
      expect(result.F).toBe(-0.3);
      expect(result.M).toBe(-0.1);
      expect(result.C.mem).toBe(-0.2);
      expect(result.C.speed).toBe(-0.4);
      expect(result.C.stability).toBe(-0.6);
    });

    it('should handle values greater than 1', () => {
      const frontend: UserStateFrontend = {
        attention: 1.5,
        fatigue: 2.0,
        motivation: 1.1,
        memory: 3.0,
        speed: 2.5,
        stability: 1.8,
      };

      const result = toCompactState(frontend);

      expect(result.A).toBe(1.5);
      expect(result.F).toBe(2.0);
      expect(result.M).toBe(1.1);
    });

    it('should preserve decimal precision', () => {
      const frontend: UserStateFrontend = {
        attention: 0.123456789,
        fatigue: 0.987654321,
        motivation: 0.111111111,
        memory: 0.222222222,
        speed: 0.333333333,
        stability: 0.444444444,
      };

      const result = toCompactState(frontend);

      expect(result.A).toBe(0.123456789);
      expect(result.F).toBe(0.987654321);
      expect(result.M).toBe(0.111111111);
    });

    it('should handle zero timestamp', () => {
      const frontend: UserStateFrontend = {
        attention: 0.5,
        fatigue: 0.5,
        motivation: 0.5,
        memory: 0.5,
        speed: 0.5,
        stability: 0.5,
        timestamp: 0,
      };

      const result = toCompactState(frontend);

      expect(result.ts).toBe(0);
    });

    it('should handle zero confidence', () => {
      const frontend: UserStateFrontend = {
        attention: 0.5,
        fatigue: 0.5,
        motivation: 0.5,
        memory: 0.5,
        speed: 0.5,
        stability: 0.5,
        confidence: 0,
      };

      const result = toCompactState(frontend);

      expect(result.conf).toBe(0);
    });
  });

  // ============ toExpandedState() 测试 ============

  describe('toExpandedState', () => {
    it('should convert complete backend state to expanded format', () => {
      const backend: UserStateBackend = {
        A: 0.8,
        F: 0.3,
        M: 0.9,
        C: {
          mem: 0.7,
          speed: 0.6,
          stability: 0.85,
        },
        conf: 0.75,
        ts: 1701849600000,
      };

      const result = toExpandedState(backend);

      expect(result).toEqual({
        attention: 0.8,
        fatigue: 0.3,
        motivation: 0.9,
        memory: 0.7,
        speed: 0.6,
        stability: 0.85,
        confidence: 0.75,
        timestamp: 1701849600000,
      });
    });

    it('should handle state without optional fields', () => {
      const backend: UserStateBackend = {
        A: 0.5,
        F: 0.5,
        M: 0.5,
        C: {
          mem: 0.5,
          speed: 0.5,
          stability: 0.5,
        },
      };

      const result = toExpandedState(backend);

      expect(result.attention).toBe(0.5);
      expect(result.fatigue).toBe(0.5);
      expect(result.motivation).toBe(0.5);
      expect(result.memory).toBe(0.5);
      expect(result.speed).toBe(0.5);
      expect(result.stability).toBe(0.5);
      expect(result.confidence).toBeUndefined();
      expect(result.timestamp).toBeUndefined();
    });

    it('should handle edge case values', () => {
      const backend: UserStateBackend = {
        A: 0,
        F: 1,
        M: 0,
        C: {
          mem: 1,
          speed: 0,
          stability: 1,
        },
      };

      const result = toExpandedState(backend);

      expect(result.attention).toBe(0);
      expect(result.fatigue).toBe(1);
      expect(result.motivation).toBe(0);
      expect(result.memory).toBe(1);
      expect(result.speed).toBe(0);
      expect(result.stability).toBe(1);
    });

    it('should handle negative values', () => {
      const backend: UserStateBackend = {
        A: -0.5,
        F: -0.3,
        M: -0.1,
        C: {
          mem: -0.2,
          speed: -0.4,
          stability: -0.6,
        },
      };

      const result = toExpandedState(backend);

      expect(result.attention).toBe(-0.5);
      expect(result.fatigue).toBe(-0.3);
      expect(result.motivation).toBe(-0.1);
      expect(result.memory).toBe(-0.2);
      expect(result.speed).toBe(-0.4);
      expect(result.stability).toBe(-0.6);
    });

    it('should preserve decimal precision', () => {
      const backend: UserStateBackend = {
        A: 0.123456789,
        F: 0.987654321,
        M: 0.111111111,
        C: {
          mem: 0.222222222,
          speed: 0.333333333,
          stability: 0.444444444,
        },
      };

      const result = toExpandedState(backend);

      expect(result.attention).toBe(0.123456789);
      expect(result.fatigue).toBe(0.987654321);
      expect(result.motivation).toBe(0.111111111);
    });
  });

  // ============ 往返转换测试 ============

  describe('roundtrip conversion', () => {
    it('should maintain data integrity through frontend -> backend -> frontend conversion', () => {
      const original: UserStateFrontend = {
        attention: 0.8,
        fatigue: 0.3,
        motivation: 0.9,
        memory: 0.7,
        speed: 0.6,
        stability: 0.85,
        confidence: 0.75,
        timestamp: 1701849600000,
      };

      const compact = toCompactState(original);
      const restored = toExpandedState(compact);

      expect(restored).toEqual(original);
    });

    it('should maintain data integrity through backend -> frontend -> backend conversion', () => {
      const original: UserStateBackend = {
        A: 0.8,
        F: 0.3,
        M: 0.9,
        C: {
          mem: 0.7,
          speed: 0.6,
          stability: 0.85,
        },
        conf: 0.75,
        ts: 1701849600000,
      };

      const expanded = toExpandedState(original);
      const restored = toCompactState(expanded);

      expect(restored).toEqual(original);
    });

    it('should maintain data integrity with minimal data', () => {
      const original: UserStateFrontend = {
        attention: 0.5,
        fatigue: 0.5,
        motivation: 0.5,
        memory: 0.5,
        speed: 0.5,
        stability: 0.5,
      };

      const compact = toCompactState(original);
      const restored = toExpandedState(compact);

      expect(restored.attention).toBe(original.attention);
      expect(restored.fatigue).toBe(original.fatigue);
      expect(restored.motivation).toBe(original.motivation);
      expect(restored.memory).toBe(original.memory);
      expect(restored.speed).toBe(original.speed);
      expect(restored.stability).toBe(original.stability);
    });

    it('should handle multiple roundtrips', () => {
      const original: UserStateFrontend = {
        attention: 0.8,
        fatigue: 0.3,
        motivation: 0.9,
        memory: 0.7,
        speed: 0.6,
        stability: 0.85,
      };

      let result = original;
      for (let i = 0; i < 10; i++) {
        const compact = toCompactState(result);
        result = toExpandedState(compact);
      }

      expect(result.attention).toBe(original.attention);
      expect(result.fatigue).toBe(original.fatigue);
      expect(result.motivation).toBe(original.motivation);
    });
  });

  // ============ 类型安全测试 ============

  describe('type safety', () => {
    it('should produce correct type structure for compact state', () => {
      const frontend: UserStateFrontend = {
        attention: 0.5,
        fatigue: 0.5,
        motivation: 0.5,
        memory: 0.5,
        speed: 0.5,
        stability: 0.5,
      };

      const result = toCompactState(frontend);

      // 验证结果具有正确的属性
      expect(typeof result.A).toBe('number');
      expect(typeof result.F).toBe('number');
      expect(typeof result.M).toBe('number');
      expect(typeof result.C).toBe('object');
      expect(typeof result.C.mem).toBe('number');
      expect(typeof result.C.speed).toBe('number');
      expect(typeof result.C.stability).toBe('number');
    });

    it('should produce correct type structure for expanded state', () => {
      const backend: UserStateBackend = {
        A: 0.5,
        F: 0.5,
        M: 0.5,
        C: {
          mem: 0.5,
          speed: 0.5,
          stability: 0.5,
        },
      };

      const result = toExpandedState(backend);

      // 验证结果具有正确的属性
      expect(typeof result.attention).toBe('number');
      expect(typeof result.fatigue).toBe('number');
      expect(typeof result.motivation).toBe('number');
      expect(typeof result.memory).toBe('number');
      expect(typeof result.speed).toBe('number');
      expect(typeof result.stability).toBe('number');
    });
  });

  // ============ 特殊数值测试 ============

  describe('special numeric values', () => {
    it('should handle very small numbers', () => {
      const frontend: UserStateFrontend = {
        attention: 0.0000001,
        fatigue: 0.0000001,
        motivation: 0.0000001,
        memory: 0.0000001,
        speed: 0.0000001,
        stability: 0.0000001,
      };

      const result = toCompactState(frontend);
      const restored = toExpandedState(result);

      expect(restored.attention).toBeCloseTo(frontend.attention, 10);
      expect(restored.fatigue).toBeCloseTo(frontend.fatigue, 10);
    });

    it('should handle very large timestamps', () => {
      const frontend: UserStateFrontend = {
        attention: 0.5,
        fatigue: 0.5,
        motivation: 0.5,
        memory: 0.5,
        speed: 0.5,
        stability: 0.5,
        timestamp: Number.MAX_SAFE_INTEGER,
      };

      const result = toCompactState(frontend);

      expect(result.ts).toBe(Number.MAX_SAFE_INTEGER);
    });
  });
});
