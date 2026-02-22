/**
 * Optimization Suggestion Generator
 *
 * Generates optimization suggestions based on render trigger analysis.
 *
 * @module handlers/frontend/render-triggers/suggestion-generator
 */

import type {
  OptimizationSuggestion,
  OptimizationPriority,
  InlineDefinition,
  ExpensiveComputation,
  ContextSubscription,
  ChildAnalysis,
} from './types.js';

/**
 * Generate optimization suggestions based on analysis
 */
export function generateSuggestions(
  isMemoized: boolean,
  inlineDefinitions: InlineDefinition[],
  expensiveComputations: ExpensiveComputation[],
  contextSubscriptions: ContextSubscription[],
  childrenAnalysis: ChildAnalysis[],
  hasPropTriggers = false
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // Check if component should be memoized:
  // - Has children to analyze, OR
  // - Receives props (may be rendered by multiple parents with shallow-equal props)
  if (!isMemoized && (childrenAnalysis.length > 0 || hasPropTriggers)) {
    suggestions.push({
      priority: 'medium',
      type: 'memo',
      description: 'Consider wrapping component with React.memo() to prevent unnecessary re-renders from parent',
      estimated_impact: 'Prevents re-renders when props are shallowly equal',
      code_example: 'export const MyComponent = React.memo(function MyComponent(props) { ... })',
    });
  }

  // Inline functions
  const inlineFunctions = inlineDefinitions.filter(d => d.type === 'function');
  if (inlineFunctions.length > 0) {
    suggestions.push({
      priority: 'high',
      type: 'useCallback',
      description: `${inlineFunctions.length} inline function(s) create new references on every render`,
      estimated_impact: 'Prevents child components from re-rendering when using React.memo',
      code_example: `const handleClick = useCallback(() => {
  // handler logic
}, [dependency]);`,
    });
  }

  // Inline objects/arrays
  const inlineObjects = inlineDefinitions.filter(d => d.type === 'object' || d.type === 'array');
  if (inlineObjects.length > 0) {
    suggestions.push({
      priority: 'high',
      type: 'useMemo',
      description: `${inlineObjects.length} inline object(s)/array(s) create new references on every render`,
      estimated_impact: 'Prevents unnecessary re-renders in memoized child components',
      code_example: `const style = useMemo(() => ({ margin: 10 }), []);`,
    });
  }

  // Expensive computations
  const unmemoizedComputations = expensiveComputations.filter(c => !c.is_memoized);
  if (unmemoizedComputations.length > 0) {
    suggestions.push({
      priority: 'medium',
      type: 'useMemo',
      description: `${unmemoizedComputations.length} potentially expensive computation(s) run on every render`,
      estimated_impact: 'Reduces CPU usage by caching computation results',
      code_example: `const sortedItems = useMemo(() => items.sort(compareFn), [items]);`,
    });
  }

  // Context subscriptions
  const broadContextSubs = contextSubscriptions.filter(
    c => c.granularity === 'entire_context' && c.issue
  );
  if (broadContextSubs.length > 0) {
    suggestions.push({
      priority: 'medium',
      type: 'context_split',
      description: 'Component subscribes to entire context(s) and re-renders on any change',
      estimated_impact: 'Split context or use selectors to reduce unnecessary re-renders',
      code_example: `// Split context into smaller pieces
const UserContext = createContext(null);
const ThemeContext = createContext(null);

// Or use a selector library like use-context-selector`,
    });
  }

  // Children receiving unstable props
  const unstableChildren = childrenAnalysis.filter(c => c.receives_unstable_props);
  if (unstableChildren.length > 0 && isMemoized) {
    suggestions.push({
      priority: 'high',
      type: 'useCallback',
      description: `${unstableChildren.length} child component(s) receive unstable props, negating any memoization`,
      estimated_impact: 'Critical - memoized children will still re-render due to unstable props',
    });
  }

  // Sort by priority
  const priorityOrder: Record<OptimizationPriority, number> = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}
