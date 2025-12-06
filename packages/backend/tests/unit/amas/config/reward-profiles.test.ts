/**
 * RewardProfiles Unit Tests
 *
 * Tests for the reward profile configuration module
 */

import { describe, it, expect } from 'vitest';
import {
  RewardProfile,
  REWARD_PROFILES,
  getRewardProfile,
  isValidProfileId
} from '../../../../src/amas/config/reward-profiles';

describe('RewardProfiles', () => {
  // ==================== REWARD_PROFILES Tests ====================

  describe('REWARD_PROFILES', () => {
    it('should define standard profile', () => {
      expect(REWARD_PROFILES.standard).toBeDefined();
      expect(REWARD_PROFILES.standard.profileId).toBe('standard');
      expect(REWARD_PROFILES.standard.name).toBeTruthy();
    });

    it('should define cram profile', () => {
      expect(REWARD_PROFILES.cram).toBeDefined();
      expect(REWARD_PROFILES.cram.profileId).toBe('cram');
      expect(REWARD_PROFILES.cram.name).toBeTruthy();
    });

    it('should define relaxed profile', () => {
      expect(REWARD_PROFILES.relaxed).toBeDefined();
      expect(REWARD_PROFILES.relaxed.profileId).toBe('relaxed');
      expect(REWARD_PROFILES.relaxed.name).toBeTruthy();
    });

    it('should have all required weight properties for each profile', () => {
      Object.values(REWARD_PROFILES).forEach(profile => {
        expect(profile.weights).toHaveProperty('correct');
        expect(profile.weights).toHaveProperty('fatigue');
        expect(profile.weights).toHaveProperty('speed');
        expect(profile.weights).toHaveProperty('frustration');
        expect(profile.weights).toHaveProperty('engagement');
      });
    });

    it('should have description for each profile', () => {
      Object.values(REWARD_PROFILES).forEach(profile => {
        expect(profile.description).toBeTruthy();
        expect(typeof profile.description).toBe('string');
      });
    });
  });

  // ==================== Profile Characteristics Tests ====================

  describe('profile characteristics', () => {
    describe('standard profile', () => {
      const standard = REWARD_PROFILES.standard;

      it('should balance all factors', () => {
        expect(standard.weights.correct).toBeCloseTo(1.0);
        expect(standard.weights.fatigue).toBeGreaterThan(0);
        expect(standard.weights.speed).toBeGreaterThan(0);
        expect(standard.weights.frustration).toBeGreaterThan(0);
        expect(standard.weights.engagement).toBeGreaterThan(0);
      });
    });

    describe('cram profile', () => {
      const cram = REWARD_PROFILES.cram;

      it('should emphasize correctness', () => {
        expect(cram.weights.correct).toBeGreaterThan(REWARD_PROFILES.standard.weights.correct);
      });

      it('should reduce fatigue penalty', () => {
        expect(cram.weights.fatigue).toBeLessThan(REWARD_PROFILES.standard.weights.fatigue);
      });

      it('should increase speed bonus', () => {
        expect(cram.weights.speed).toBeGreaterThan(REWARD_PROFILES.standard.weights.speed);
      });

      it('should tolerate more frustration', () => {
        expect(cram.weights.frustration).toBeLessThan(REWARD_PROFILES.standard.weights.frustration);
      });

      it('should de-prioritize engagement', () => {
        expect(cram.weights.engagement).toBeLessThan(REWARD_PROFILES.standard.weights.engagement);
      });
    });

    describe('relaxed profile', () => {
      const relaxed = REWARD_PROFILES.relaxed;

      it('should reduce correctness pressure', () => {
        expect(relaxed.weights.correct).toBeLessThan(REWARD_PROFILES.standard.weights.correct);
      });

      it('should maximize fatigue awareness', () => {
        expect(relaxed.weights.fatigue).toBeGreaterThan(REWARD_PROFILES.standard.weights.fatigue);
      });

      it('should minimize speed pressure', () => {
        expect(relaxed.weights.speed).toBeLessThan(REWARD_PROFILES.standard.weights.speed);
      });

      it('should maximize frustration avoidance', () => {
        expect(relaxed.weights.frustration).toBeGreaterThan(REWARD_PROFILES.standard.weights.frustration);
      });

      it('should prioritize engagement', () => {
        expect(relaxed.weights.engagement).toBeGreaterThan(REWARD_PROFILES.standard.weights.engagement);
      });
    });
  });

  // ==================== getRewardProfile Tests ====================

  describe('getRewardProfile', () => {
    it('should return standard profile by default', () => {
      const profile = getRewardProfile();

      expect(profile.profileId).toBe('standard');
    });

    it('should return standard profile for undefined', () => {
      const profile = getRewardProfile(undefined);

      expect(profile.profileId).toBe('standard');
    });

    it('should return standard profile by name', () => {
      const profile = getRewardProfile('standard');

      expect(profile.profileId).toBe('standard');
      expect(profile).toEqual(REWARD_PROFILES.standard);
    });

    it('should return cram profile by name', () => {
      const profile = getRewardProfile('cram');

      expect(profile.profileId).toBe('cram');
      expect(profile).toEqual(REWARD_PROFILES.cram);
    });

    it('should return relaxed profile by name', () => {
      const profile = getRewardProfile('relaxed');

      expect(profile.profileId).toBe('relaxed');
      expect(profile).toEqual(REWARD_PROFILES.relaxed);
    });

    it('should return standard profile for invalid id', () => {
      const profile = getRewardProfile('invalid');

      expect(profile.profileId).toBe('standard');
    });

    it('should return standard profile for empty string', () => {
      const profile = getRewardProfile('');

      expect(profile.profileId).toBe('standard');
    });
  });

  // ==================== isValidProfileId Tests ====================

  describe('isValidProfileId', () => {
    it('should return true for standard', () => {
      expect(isValidProfileId('standard')).toBe(true);
    });

    it('should return true for cram', () => {
      expect(isValidProfileId('cram')).toBe(true);
    });

    it('should return true for relaxed', () => {
      expect(isValidProfileId('relaxed')).toBe(true);
    });

    it('should return false for invalid id', () => {
      expect(isValidProfileId('invalid')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidProfileId('')).toBe(false);
    });

    it('should return false for similar but incorrect ids', () => {
      expect(isValidProfileId('Standard')).toBe(false);
      expect(isValidProfileId('CRAM')).toBe(false);
      expect(isValidProfileId('Relaxed')).toBe(false);
    });
  });

  // ==================== Weight Constraints Tests ====================

  describe('weight constraints', () => {
    it('should have all positive weights', () => {
      Object.values(REWARD_PROFILES).forEach(profile => {
        Object.values(profile.weights).forEach(weight => {
          expect(weight).toBeGreaterThan(0);
        });
      });
    });

    it('should have weights in reasonable range', () => {
      Object.values(REWARD_PROFILES).forEach(profile => {
        Object.values(profile.weights).forEach(weight => {
          expect(weight).toBeGreaterThan(0);
          expect(weight).toBeLessThanOrEqual(2);
        });
      });
    });
  });

  // ==================== Use Case Tests ====================

  describe('use cases', () => {
    it('cram profile should optimize for exam preparation', () => {
      const cram = REWARD_PROFILES.cram;

      // Higher weight on correctness and speed
      // Lower weight on fatigue (allow pushing through)
      expect(cram.weights.correct + cram.weights.speed)
        .toBeGreaterThan(cram.weights.fatigue + cram.weights.engagement);
    });

    it('relaxed profile should optimize for sustainable learning', () => {
      const relaxed = REWARD_PROFILES.relaxed;

      // Higher weight on fatigue and frustration avoidance
      expect(relaxed.weights.fatigue + relaxed.weights.frustration)
        .toBeGreaterThan(relaxed.weights.speed);
    });

    it('standard profile should be balanced', () => {
      const standard = REWARD_PROFILES.standard;

      // Correctness should be the primary factor
      expect(standard.weights.correct).toBeGreaterThanOrEqual(
        Math.max(
          standard.weights.fatigue,
          standard.weights.speed,
          standard.weights.engagement
        )
      );
    });
  });

  // ==================== Profile Comparison Tests ====================

  describe('profile comparison', () => {
    it('profiles should have different characteristics', () => {
      const standard = REWARD_PROFILES.standard;
      const cram = REWARD_PROFILES.cram;
      const relaxed = REWARD_PROFILES.relaxed;

      // Each profile should differ from standard in at least one significant way
      expect(cram.weights.correct).not.toBe(standard.weights.correct);
      expect(relaxed.weights.fatigue).not.toBe(standard.weights.fatigue);
    });

    it('cram and relaxed should be opposite in key aspects', () => {
      const cram = REWARD_PROFILES.cram;
      const relaxed = REWARD_PROFILES.relaxed;

      // Cram prioritizes speed and correctness
      // Relaxed prioritizes comfort and engagement
      expect(cram.weights.speed).toBeGreaterThan(relaxed.weights.speed);
      expect(cram.weights.fatigue).toBeLessThan(relaxed.weights.fatigue);
      expect(cram.weights.engagement).toBeLessThan(relaxed.weights.engagement);
    });
  });
});
