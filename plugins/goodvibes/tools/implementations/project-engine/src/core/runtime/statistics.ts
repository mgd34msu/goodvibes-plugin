/**
 * Statistical analysis utilities for the runtime domain.
 *
 * Provides linear regression, memory trend analysis, leak suspect generation,
 * memory recommendations, and timing statistics calculation.
 *
 * @module core/runtime/statistics
 */

import type { MemorySnapshot, MemoryAnalysis } from './types.js';

/** Linear regression result (slope in MB/s, intercept, R-squared) */
export interface LinearRegressionResult {
  /** Slope in MB per second (positive = growing) */
  slope: number;
  /** Intercept value */
  intercept: number;
  /** R-squared value (0-1, higher = better fit) */
  r_squared: number;
}

/** A suspected memory leak source */
export interface LeakSuspect {
  /** Type of suspected leak */
  type: string;
  /** Description of the suspicion */
  description: string;
  /** Confidence level in this suspicion */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Timing statistics from profiling.
 */
export interface TimingStats {
  mean_ms: number;
  median_ms: number;
  p95_ms: number;
  p99_ms: number;
  min_ms: number;
  max_ms: number;
  std_dev_ms: number;
  total_ms: number;
}

/**
 * Performs linear regression on (x, y) data points.
 *
 * Returns the slope (MB/second), intercept, and R-squared value.
 * Handles degenerate cases (< 2 points, all-same x, all-same y).
 *
 * @param x - Independent variable values (e.g., time in seconds)
 * @param y - Dependent variable values (e.g., memory in MB)
 * @returns Linear regression result
 */
export function linearRegression(x: number[], y: number[]): LinearRegressionResult {
  const n = x.length;
  if (n < 2) {
    return { slope: 0, intercept: y[0] || 0, r_squared: 0 };
  }

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  // sumY2 referenced to avoid unused var warning
  void sumY2;

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) {
    // All x values are the same
    return { slope: 0, intercept: sumY / n, r_squared: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const yMean = sumY / n;
  const ssTotal = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);

  if (ssTotal < 1e-10) {
    // All y values are the same
    return { slope: 0, intercept: yMean, r_squared: 1 };
  }

  const ssRes = y.reduce((sum, yi, i) => sum + (yi - (slope * x[i] + intercept)) ** 2, 0);
  const rSquared = Math.max(0, Math.min(1, 1 - ssRes / ssTotal));

  return {
    slope: Math.round(slope * 1000000) / 1000000, // 6 decimal places
    intercept: Math.round(intercept * 100) / 100,
    r_squared: Math.round(rSquared * 1000) / 1000,
  };
}

/**
 * Analyzes memory snapshots for trends using linear regression.
 *
 * Classifies memory as `stable`, `growing`, or `declining` based on
 * regression slope and R-squared fit.
 *
 * @param snapshots - Array of memory snapshots collected during monitoring
 * @param durationSeconds - Actual monitoring duration in seconds
 * @returns Memory trend analysis
 */
export function analyzeMemoryTrend(
  snapshots: MemorySnapshot[],
  durationSeconds: number
): MemoryAnalysis {
  const rssValues = snapshots.map((s) => s.rss_mb);
  const initial = rssValues[0];
  const final = rssValues[rssValues.length - 1];
  const growth = final - initial;

  // Calculate growth rate in MB per minute
  const growthRatePerMinute = durationSeconds > 0
    ? (growth / durationSeconds) * 60
    : 0;

  // Linear regression on time (seconds) vs memory (MB)
  const timeSeconds = snapshots.map((s) => s.elapsed_ms / 1000);
  const regression = linearRegression(timeSeconds, rssValues);

  // Determine trend based on slope and R-squared
  // slope > 0.01 MB/s with reasonable fit = growing
  // slope < -0.01 MB/s with reasonable fit = declining
  // otherwise stable
  let trend: 'stable' | 'growing' | 'declining' = 'stable';

  if (regression.r_squared > 0.5) {
    // Good fit, use slope to determine trend
    if (regression.slope > 0.01) {
      trend = 'growing';
    } else if (regression.slope < -0.01) {
      trend = 'declining';
    }
  } else if (growth > 5) {
    // Poor fit but significant growth
    trend = 'growing';
  } else if (growth < -5) {
    trend = 'declining';
  }

  return {
    initial_heap_mb: Math.round(initial * 100) / 100,
    final_heap_mb: Math.round(final * 100) / 100,
    heap_growth_mb: Math.round(growth * 100) / 100,
    growth_rate_mb_per_minute: Math.round(growthRatePerMinute * 100) / 100,
    trend,
    linear_regression: snapshots.length >= 3 ? regression : undefined,
  };
}

/**
 * Generates leak suspects based on memory trend analysis.
 *
 * Produces high/medium confidence suspects for consistent growth,
 * large absolute growth, and rapid growth rate patterns.
 *
 * @param analysis - Memory trend analysis result
 * @returns Array of leak suspects (may be empty if no leak detected)
 */
export function generateLeakSuspects(analysis: MemoryAnalysis): LeakSuspect[] {
  const suspects: LeakSuspect[] = [];

  // High growth rate with good linear fit
  if (analysis.linear_regression && analysis.linear_regression.r_squared > 0.8) {
    if (analysis.linear_regression.slope > 0.1) {
      suspects.push({
        type: 'consistent_growth',
        description: `Memory is growing consistently at ~${Math.round(analysis.linear_regression.slope * 60 * 100) / 100} MB/min with high correlation (R\u00b2=${analysis.linear_regression.r_squared})`,
        confidence: 'high',
      });
    }
  }

  // Large absolute growth
  if (analysis.heap_growth_mb > 50) {
    suspects.push({
      type: 'large_growth',
      description: `Memory grew by ${analysis.heap_growth_mb} MB during monitoring period`,
      confidence: analysis.heap_growth_mb > 100 ? 'high' : 'medium',
    });
  }

  // High growth rate
  if (analysis.growth_rate_mb_per_minute > 10) {
    suspects.push({
      type: 'rapid_growth',
      description: `Memory is growing at ${analysis.growth_rate_mb_per_minute} MB/minute`,
      confidence: analysis.growth_rate_mb_per_minute > 50 ? 'high' : 'medium',
    });
  }

  // Moderate fit
  if (
    analysis.linear_regression &&
    analysis.linear_regression.r_squared > 0.5 &&
    analysis.linear_regression.r_squared <= 0.8 &&
    analysis.linear_regression.slope > 0.05
  ) {
    suspects.push({
      type: 'probable_leak',
      description: `Memory shows growth pattern (slope=${analysis.linear_regression.slope} MB/s) with moderate correlation`,
      confidence: 'medium',
    });
  }

  return suspects;
}

/**
 * Generates actionable recommendations based on memory leak analysis.
 *
 * Provides investigation steps when a leak is detected and general
 * guidance otherwise.
 *
 * @param leakDetected - Whether a memory leak was detected
 * @param analysis - Memory trend analysis result
 * @param suspects - Array of identified leak suspects
 * @returns Array of recommendation strings
 */
export function generateMemoryRecommendations(
  leakDetected: boolean,
  analysis: MemoryAnalysis,
  suspects: LeakSuspect[]
): string[] {
  const recommendations: string[] = [];

  if (leakDetected) {
    recommendations.push('Memory leak detected. Consider the following investigation steps:');

    if (suspects.some((s) => s.confidence === 'high')) {
      recommendations.push('- Use Node.js --inspect flag and Chrome DevTools to take heap snapshots');
      recommendations.push('- Compare heap snapshots over time to identify growing object types');
    }

    if (analysis.growth_rate_mb_per_minute > 50) {
      recommendations.push('- URGENT: Rapid memory growth detected. This may cause OOM errors soon');
      recommendations.push('- Check for unbounded arrays, maps, or caches');
      recommendations.push('- Look for event listeners that are never removed');
    }

    recommendations.push('- Check for global variables accumulating data');
    recommendations.push('- Verify all timers and intervals are cleared on cleanup');
    recommendations.push('- Review closures that may hold references to large objects');
    recommendations.push('- Check for memory held by unresolved promises');
  } else if (analysis.trend === 'growing') {
    recommendations.push('Memory is growing but within acceptable bounds');
    recommendations.push('- Monitor over a longer period to confirm stability');
    recommendations.push('- Consider running with --expose-gc and manual GC triggers');
  } else if (analysis.trend === 'stable') {
    recommendations.push('Memory usage appears stable');
    recommendations.push('- No immediate action required');
    recommendations.push('- Consider periodic monitoring in production');
  } else {
    recommendations.push('Memory usage is declining (garbage collection active)');
    recommendations.push('- This is typically healthy behavior');
  }

  return recommendations;
}

/**
 * Calculates timing statistics from an array of elapsed times.
 *
 * Computes mean, median, p95, p99, min, max, standard deviation, and total.
 *
 * @param times - Array of elapsed time values in milliseconds
 * @returns Timing statistics object
 */
export function calculateTimingStats(times: number[]): TimingStats {
  if (times.length === 0) {
    return {
      mean_ms: 0,
      median_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
      min_ms: 0,
      max_ms: 0,
      std_dev_ms: 0,
      total_ms: 0,
    };
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const mean = sum / times.length;

  // Median
  const midIndex = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[midIndex - 1] + sorted[midIndex]) / 2
      : sorted[midIndex];

  // Percentiles
  const p95Index = Math.floor(sorted.length * 0.95);
  const p99Index = Math.floor(sorted.length * 0.99);
  const p95 = sorted[Math.min(p95Index, sorted.length - 1)];
  const p99 = sorted[Math.min(p99Index, sorted.length - 1)];

  // Standard deviation
  const variance =
    times.reduce((sumSq, t) => sumSq + (t - mean) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);

  const roundTo = (num: number, decimals: number): number => {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
  };

  return {
    mean_ms: roundTo(mean, 4),
    median_ms: roundTo(median, 4),
    p95_ms: roundTo(p95, 4),
    p99_ms: roundTo(p99, 4),
    min_ms: roundTo(sorted[0], 4),
    max_ms: roundTo(sorted[sorted.length - 1], 4),
    std_dev_ms: roundTo(stdDev, 4),
    total_ms: roundTo(sum, 4),
  };
}
