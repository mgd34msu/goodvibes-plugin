/**
 * Trace Component State Handler
 *
 * Traces React state and props through component trees using TypeScript
 * AST analysis. Analyzes useState, useReducer, useRef, useContext, useEffect,
 * and other hooks. Detects common issues like prop drilling and callback
 * instability.
 *
 * @module handlers/frontend/trace-component-state
 */

// Re-export everything from the modular implementation
export {
  handleTraceComponentState,
  type TraceComponentStateArgs,
  type TraceComponentStateResult,
  type LocalStateInfo,
  type ReceivedProp,
  type PassedDownProp,
  type PropsAnalysis,
  type ConsumedContext,
  type ProvidedContext,
  type ContextAnalysis,
  type EffectInfo,
  type ComponentIssue,
  type ToolResponse,
} from './component-state/index.js';
