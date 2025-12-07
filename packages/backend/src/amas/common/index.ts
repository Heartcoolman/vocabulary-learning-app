/**
 * AMAS Common Module
 *
 * Exports shared utilities and infrastructure for the AMAS system:
 * - Circuit Breaker: Fault tolerance and automatic degradation
 * - Smart Router: Intelligent Native/TypeScript routing
 * - Smart Wrapper Base: Base class for hybrid implementations
 * - Utilities: Matrix operations, type validators, telemetry
 */

// ==================== Circuit Breaker ====================
export {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerOptions,
  CircuitBreakerWrapperOptions,
  withCircuitBreaker,
  withCircuitBreakerAsync,
  createCircuitBreakerWrapper,
  createDefaultCircuitBreaker,
} from './circuit-breaker';

// ==================== Smart Router ====================
export {
  SmartRouter,
  RouteDecision,
  OperationComplexity,
  OperationConfig,
  RouteOptions,
  RouterStats,
  createSmartRouter,
} from './smart-router';

// ==================== Smart Wrapper Base ====================
export {
  SmartWrapperBase,
  SmartWrapperBaseConfig,
  SmartExecuteOptions,
  WrapperStats,
} from './smart-wrapper-base';

// ==================== Utilities ====================
export * from './matrix-utils';
export * from './type-validators';
export * from './telemetry';
