import { randomUUID } from "crypto";

/**
 * Represents a single trace span.
 */
export interface Span {
  /** Unique span identifier */
  id: string;
  /** Parent span ID (null for root spans) */
  parent_id: string | null;
  /** Trace ID (shared across related spans) */
  trace_id: string;
  /** Operation name */
  name: string;
  /** Start time (ISO string) */
  start_time: string;
  /** End time (ISO string) */
  end_time?: string;
  /** Duration in milliseconds */
  duration_ms?: number;
  /** Span status */
  status: "running" | "success" | "error";
  /** Error message if failed */
  error?: string;
  /** Custom attributes */
  attributes: Record<string, string | number | boolean>;
  /** Events that occurred during the span */
  events: SpanEvent[];
}

/**
 * Represents an event within a span.
 */
export interface SpanEvent {
  /** Event name */
  name: string;
  /** Event timestamp (ISO string) */
  timestamp: string;
  /** Event attributes */
  attributes: Record<string, string | number | boolean>;
}

/**
 * Metrics counter.
 */
export interface MetricCounter {
  /** Counter name */
  name: string;
  /** Current value */
  value: number;
  /** Labels for this counter */
  labels: Record<string, string>;
}

/**
 * Metrics histogram.
 */
export interface MetricHistogram {
  /** Histogram name */
  name: string;
  /** Recorded values */
  values: number[];
  /** Count of values */
  count: number;
  /** Sum of values */
  sum: number;
  /** Min value */
  min: number;
  /** Max value */
  max: number;
  /** Labels for this histogram */
  labels: Record<string, string>;
}

/**
 * Performance metrics.
 */
export interface PerformanceMetrics {
  /** Total tokens used */
  total_tokens: number;
  /** Input tokens */
  input_tokens: number;
  /** Output tokens */
  output_tokens: number;
  /** Total cost in USD */
  cost_usd: number;
  /** Total latency in ms */
  total_latency_ms: number;
  /** Average latency per operation in ms */
  avg_latency_ms: number;
  /** Throughput (operations per second) */
  throughput_ops: number;
  /** Number of operations */
  operation_count: number;
  /** Number of successful operations */
  success_count: number;
  /** Number of failed operations */
  error_count: number;
  /** Success rate (0-1) */
  success_rate: number;
}

/**
 * Telemetry configuration.
 */
export interface TelemetryConfig {
  /** Whether tracing is enabled */
  tracing_enabled: boolean;
  /** Whether metrics are enabled */
  metrics_enabled: boolean;
  /** Whether performance monitoring is enabled */
  performance_enabled: boolean;
  /** Maximum spans to keep in memory */
  max_spans: number;
  /** Maximum metrics history to keep */
  max_metrics_history: number;
}

/** Default configuration */
const DEFAULT_CONFIG: TelemetryConfig = {
  tracing_enabled: true,
  metrics_enabled: true,
  performance_enabled: true,
  max_spans: 1000,
  max_metrics_history: 10000,
};

/**
 * Telemetry system for tracing, metrics, and performance monitoring.
 */
export class Telemetry {
  private config: TelemetryConfig;
  private spans: Map<string, Span>;
  private activeSpans: Map<string, Span>;
  private counters: Map<string, MetricCounter>;
  private histograms: Map<string, MetricHistogram>;
  private performanceData: {
    tokens: { input: number; output: number };
    cost: number;
    latencies: number[];
    operations: number;
    successes: number;
    errors: number;
    startTime: number;
  };

  /**
   * Creates a new Telemetry instance.
   */
  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.spans = new Map();
    this.activeSpans = new Map();
    this.counters = new Map();
    this.histograms = new Map();
    this.performanceData = {
      tokens: { input: 0, output: 0 },
      cost: 0,
      latencies: [],
      operations: 0,
      successes: 0,
      errors: 0,
      startTime: Date.now(),
    };
  }

  // ============ Tracing Methods ============

  /**
   * Starts a new trace span.
   */
  startSpan(
    name: string,
    options: {
      parent_id?: string;
      trace_id?: string;
      attributes?: Record<string, string | number | boolean>;
    } = {}
  ): Span {
    if (!this.config.tracing_enabled) {
      // Return a no-op span
      return {
        id: "",
        parent_id: null,
        trace_id: "",
        name,
        start_time: new Date().toISOString(),
        status: "running",
        attributes: {},
        events: [],
      };
    }

    const span: Span = {
      id: randomUUID(),
      parent_id: options.parent_id || null,
      trace_id: options.trace_id || randomUUID(),
      name,
      start_time: new Date().toISOString(),
      status: "running",
      attributes: options.attributes || {},
      events: [],
    };

    this.spans.set(span.id, span);
    this.activeSpans.set(span.id, span);
    this.pruneSpans();

    return span;
  }

  /**
   * Ends a span successfully.
   */
  endSpan(spanId: string, attributes?: Record<string, string | number | boolean>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.end_time = new Date().toISOString();
    span.duration_ms = new Date(span.end_time).getTime() - new Date(span.start_time).getTime();
    span.status = "success";

    if (attributes) {
      span.attributes = { ...span.attributes, ...attributes };
    }

    this.activeSpans.delete(spanId);

    // Track latency for performance
    if (this.config.performance_enabled && span.duration_ms) {
      this.performanceData.latencies.push(span.duration_ms);
      this.performanceData.operations++;
      this.performanceData.successes++;
    }
  }

  /**
   * Ends a span with an error.
   */
  errorSpan(spanId: string, error: string): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.end_time = new Date().toISOString();
    span.duration_ms = new Date(span.end_time).getTime() - new Date(span.start_time).getTime();
    span.status = "error";
    span.error = error;

    this.activeSpans.delete(spanId);

    // Track for performance
    if (this.config.performance_enabled) {
      if (span.duration_ms) {
        this.performanceData.latencies.push(span.duration_ms);
      }
      this.performanceData.operations++;
      this.performanceData.errors++;
    }
  }

  /**
   * Adds an event to a span.
   */
  addSpanEvent(
    spanId: string,
    name: string,
    attributes: Record<string, string | number | boolean> = {}
  ): void {
    const span = this.activeSpans.get(spanId) || this.spans.get(spanId);
    if (!span) return;

    span.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes,
    });
  }

  /**
   * Sets attributes on a span.
   */
  setSpanAttributes(spanId: string, attributes: Record<string, string | number | boolean>): void {
    const span = this.activeSpans.get(spanId) || this.spans.get(spanId);
    if (!span) return;

    span.attributes = { ...span.attributes, ...attributes };
  }

  /**
   * Gets a span by ID.
   */
  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Gets all spans for a trace.
   */
  getTraceSpans(traceId: string): Span[] {
    return Array.from(this.spans.values()).filter((s) => s.trace_id === traceId);
  }

  /**
   * Creates a child span.
   */
  createChildSpan(
    parentSpan: Span,
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): Span {
    return this.startSpan(name, {
      parent_id: parentSpan.id,
      trace_id: parentSpan.trace_id,
      attributes,
    });
  }

  /**
   * Prunes old spans to stay within limit.
   */
  private pruneSpans(): void {
    if (this.spans.size <= this.config.max_spans) return;

    const sorted = Array.from(this.spans.entries()).sort(
      (a, b) => new Date(b[1].start_time).getTime() - new Date(a[1].start_time).getTime()
    );

    const toDelete = sorted.slice(this.config.max_spans);
    for (const [id] of toDelete) {
      this.spans.delete(id);
    }
  }

  // ============ Metrics Methods ============

  /**
   * Increments a counter.
   */
  incrementCounter(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    if (!this.config.metrics_enabled) return;

    const key = this.getMetricKey(name, labels);
    const counter = this.counters.get(key) || {
      name,
      value: 0,
      labels,
    };

    counter.value += value;
    this.counters.set(key, counter);
  }

  /**
   * Gets a counter value.
   */
  getCounter(name: string, labels: Record<string, string> = {}): number {
    const key = this.getMetricKey(name, labels);
    return this.counters.get(key)?.value || 0;
  }

  /**
   * Records a histogram value.
   */
  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    if (!this.config.metrics_enabled) return;

    const key = this.getMetricKey(name, labels);
    let histogram = this.histograms.get(key);

    if (!histogram) {
      histogram = {
        name,
        values: [],
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        labels,
      };
    }

    histogram.values.push(value);
    histogram.count++;
    histogram.sum += value;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);

    // Trim values to max history
    if (histogram.values.length > this.config.max_metrics_history) {
      histogram.values = histogram.values.slice(-this.config.max_metrics_history);
    }

    this.histograms.set(key, histogram);
  }

  /**
   * Gets histogram statistics.
   */
  getHistogram(
    name: string,
    labels: Record<string, string> = {}
  ): {
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const key = this.getMetricKey(name, labels);
    const histogram = this.histograms.get(key);

    if (!histogram || histogram.count === 0) return null;

    const sorted = [...histogram.values].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      count: histogram.count,
      sum: histogram.sum,
      min: histogram.min,
      max: histogram.max,
      avg: histogram.sum / histogram.count,
      p50: sorted[p50Index] || 0,
      p95: sorted[p95Index] || 0,
      p99: sorted[p99Index] || 0,
    };
  }

  /**
   * Gets a metric key for storage.
   */
  private getMetricKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  /**
   * Gets all counter values.
   */
  getAllCounters(): MetricCounter[] {
    return Array.from(this.counters.values());
  }

  /**
   * Gets all histogram summaries.
   */
  getAllHistograms(): Array<MetricHistogram & { avg: number }> {
    return Array.from(this.histograms.values()).map((h) => ({
      ...h,
      avg: h.count > 0 ? h.sum / h.count : 0,
    }));
  }

  // ============ Performance Methods ============

  /**
   * Records token usage.
   */
  recordTokenUsage(inputTokens: number, outputTokens: number, costUsd: number): void {
    if (!this.config.performance_enabled) return;

    this.performanceData.tokens.input += inputTokens;
    this.performanceData.tokens.output += outputTokens;
    this.performanceData.cost += costUsd;
  }

  /**
   * Gets current performance metrics.
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const elapsed = (Date.now() - this.performanceData.startTime) / 1000; // seconds
    const latencies = this.performanceData.latencies;
    const totalLatency = latencies.reduce((sum, l) => sum + l, 0);
    const avgLatency = latencies.length > 0 ? totalLatency / latencies.length : 0;

    return {
      total_tokens: this.performanceData.tokens.input + this.performanceData.tokens.output,
      input_tokens: this.performanceData.tokens.input,
      output_tokens: this.performanceData.tokens.output,
      cost_usd: Math.round(this.performanceData.cost * 10000) / 10000,
      total_latency_ms: totalLatency,
      avg_latency_ms: Math.round(avgLatency * 100) / 100,
      throughput_ops: elapsed > 0 ? Math.round((this.performanceData.operations / elapsed) * 100) / 100 : 0,
      operation_count: this.performanceData.operations,
      success_count: this.performanceData.successes,
      error_count: this.performanceData.errors,
      success_rate:
        this.performanceData.operations > 0
          ? Math.round((this.performanceData.successes / this.performanceData.operations) * 1000) / 1000
          : 1,
    };
  }

  /**
   * Resets performance metrics.
   */
  resetPerformanceMetrics(): void {
    this.performanceData = {
      tokens: { input: 0, output: 0 },
      cost: 0,
      latencies: [],
      operations: 0,
      successes: 0,
      errors: 0,
      startTime: Date.now(),
    };
  }

  // ============ Utility Methods ============

  /**
   * Gets the configuration.
   */
  getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   */
  updateConfig(config: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clears all telemetry data.
   */
  clear(): void {
    this.spans.clear();
    this.activeSpans.clear();
    this.counters.clear();
    this.histograms.clear();
    this.resetPerformanceMetrics();
  }

  /**
   * Gets a summary of current telemetry state.
   */
  getSummary(): {
    spans: { total: number; active: number };
    counters: number;
    histograms: number;
    performance: PerformanceMetrics;
  } {
    return {
      spans: {
        total: this.spans.size,
        active: this.activeSpans.size,
      },
      counters: this.counters.size,
      histograms: this.histograms.size,
      performance: this.getPerformanceMetrics(),
    };
  }
}
