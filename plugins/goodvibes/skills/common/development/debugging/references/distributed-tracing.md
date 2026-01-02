# Distributed Tracing Setup Guide

Implementing distributed tracing with OpenTelemetry, Jaeger, and Zipkin.

## Core Concepts

### Terminology

| Term | Definition |
|------|------------|
| **Trace** | Complete journey of a request through all services |
| **Span** | Single operation within a trace (e.g., HTTP request, DB query) |
| **Trace ID** | Unique identifier for the entire trace |
| **Span ID** | Unique identifier for a single span |
| **Parent Span** | The span that triggered the current span |
| **Context** | Trace information propagated between services |
| **Baggage** | Key-value pairs propagated with context |

### Trace Structure

```
Trace: abc123
|
+-- Span: API Gateway (root span)
    |-- Span ID: span1
    |-- Duration: 500ms
    |
    +-- Span: Auth Service
    |   |-- Span ID: span2
    |   |-- Parent: span1
    |   |-- Duration: 50ms
    |
    +-- Span: User Service
        |-- Span ID: span3
        |-- Parent: span1
        |-- Duration: 200ms
        |
        +-- Span: Database Query
            |-- Span ID: span4
            |-- Parent: span3
            |-- Duration: 50ms
```

---

## OpenTelemetry Setup

### Node.js

```bash
# Install packages
npm install @opentelemetry/sdk-node \
            @opentelemetry/auto-instrumentations-node \
            @opentelemetry/exporter-trace-otlp-http
```

```javascript
// tracing.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'my-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter: new OTLPTraceExporter({
    url: 'http://jaeger:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
```

```javascript
// app.js - Load tracing first
require('./tracing');

const express = require('express');
const app = express();

// Your routes here - automatically traced
```

### Python

```bash
# Install packages
pip install opentelemetry-sdk \
            opentelemetry-api \
            opentelemetry-instrumentation \
            opentelemetry-exporter-otlp
```

```python
# tracing.py
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

# Configure resource
resource = Resource(attributes={
    SERVICE_NAME: "my-python-service"
})

# Configure tracer
provider = TracerProvider(resource=resource)
processor = BatchSpanProcessor(OTLPSpanExporter(
    endpoint="http://jaeger:4318/v1/traces"
))
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

# Auto-instrument
FlaskInstrumentor().instrument()
RequestsInstrumentor().instrument()
```

```python
# app.py
import tracing  # Load first

from flask import Flask
app = Flask(__name__)

@app.route('/')
def hello():
    return 'Hello, World!'
```

### Go

```go
package main

import (
    "context"
    "log"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
)

func initTracer() (*sdktrace.TracerProvider, error) {
    ctx := context.Background()

    exporter, err := otlptracehttp.New(ctx,
        otlptracehttp.WithEndpoint("jaeger:4318"),
        otlptracehttp.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }

    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String("my-go-service"),
        )),
    )

    otel.SetTracerProvider(tp)
    return tp, nil
}

func main() {
    tp, err := initTracer()
    if err != nil {
        log.Fatal(err)
    }
    defer tp.Shutdown(context.Background())

    // Your app here
}
```

---

## Backend Setup

### Jaeger

**Docker Compose:**
```yaml
version: '3'
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP
      - "14250:14250"  # gRPC
      - "14268:14268"  # HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

**Kubernetes:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jaeger
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jaeger
  template:
    metadata:
      labels:
        app: jaeger
    spec:
      containers:
      - name: jaeger
        image: jaegertracing/all-in-one:latest
        ports:
        - containerPort: 16686
        - containerPort: 4317
        - containerPort: 4318
        env:
        - name: COLLECTOR_OTLP_ENABLED
          value: "true"
---
apiVersion: v1
kind: Service
metadata:
  name: jaeger
spec:
  ports:
  - name: ui
    port: 16686
  - name: otlp-grpc
    port: 4317
  - name: otlp-http
    port: 4318
  selector:
    app: jaeger
```

### Zipkin

**Docker:**
```bash
docker run -d -p 9411:9411 openzipkin/zipkin
```

**OpenTelemetry to Zipkin:**
```javascript
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');

const exporter = new ZipkinExporter({
  url: 'http://zipkin:9411/api/v2/spans',
});
```

---

## Context Propagation

### HTTP Headers

OpenTelemetry uses W3C Trace Context by default:

```
traceparent: 00-<trace-id>-<span-id>-<flags>
tracestate: <vendor-specific data>

Example:
traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
```

### Manual Propagation

**Injecting context (sender):**
```javascript
const { context, propagation } = require('@opentelemetry/api');

const headers = {};
propagation.inject(context.active(), headers);

// headers now contains traceparent
fetch('http://service-b/api', { headers });
```

**Extracting context (receiver):**
```javascript
const { context, propagation, trace } = require('@opentelemetry/api');

app.use((req, res, next) => {
  const ctx = propagation.extract(context.active(), req.headers);
  const span = trace.getTracer('my-service').startSpan('handle-request', {}, ctx);
  // ...
});
```

---

## Custom Spans

### Node.js

```javascript
const { trace } = require('@opentelemetry/api');

const tracer = trace.getTracer('my-module');

async function processOrder(order) {
  return tracer.startActiveSpan('processOrder', async (span) => {
    try {
      span.setAttribute('order.id', order.id);
      span.setAttribute('order.total', order.total);

      // Child span
      await tracer.startActiveSpan('validateOrder', async (childSpan) => {
        // validation logic
        childSpan.end();
      });

      // Add event
      span.addEvent('order.processed', {
        'order.status': 'completed'
      });

      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Python

```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

def process_order(order):
    with tracer.start_as_current_span("processOrder") as span:
        span.set_attribute("order.id", order.id)
        span.set_attribute("order.total", order.total)

        with tracer.start_as_current_span("validateOrder"):
            # validation logic
            pass

        span.add_event("order.processed", {"order.status": "completed"})

        return result
```

---

## Sampling

### Head-based Sampling

Decision made at trace start:

```javascript
const { TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');

const sdk = new NodeSDK({
  sampler: new TraceIdRatioBasedSampler(0.1), // Sample 10%
});
```

### Tail-based Sampling

Decision made after trace complete (with collector):

```yaml
# otel-collector-config.yaml
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors
        type: status_code
        status_code: {status_codes: [ERROR]}
      - name: slow-traces
        type: latency
        latency: {threshold_ms: 1000}
      - name: random
        type: probabilistic
        probabilistic: {sampling_percentage: 10}
```

---

## Debugging with Traces

### Finding Slow Services

1. Open Jaeger UI (http://localhost:16686)
2. Search for traces by service
3. Sort by duration
4. Click on slow traces
5. Identify bottleneck spans

### Finding Errors

1. Search for traces with errors
2. Look for spans with error status
3. Check exception details
4. Follow span chain to root cause

### Trace Analysis Queries

**Jaeger:**
```
# Traces over 1 second
minDuration=1s

# Traces with errors
tag=error:true

# Traces for specific operation
operationName=POST /api/orders

# Traces with specific attribute
tag=user.id:12345
```

---

## Best Practices

### 1. Instrument at Boundaries

```
- HTTP requests (incoming/outgoing)
- Database queries
- Message queue operations
- External API calls
- Cache operations
```

### 2. Add Meaningful Attributes

```javascript
span.setAttribute('user.id', user.id);
span.setAttribute('order.id', order.id);
span.setAttribute('db.statement', 'SELECT * FROM users');
span.setAttribute('http.method', 'POST');
span.setAttribute('http.url', '/api/orders');
```

### 3. Use Semantic Conventions

```javascript
const { SemanticAttributes } = require('@opentelemetry/semantic-conventions');

span.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');
span.setAttribute(SemanticAttributes.HTTP_URL, url);
span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, 200);
span.setAttribute(SemanticAttributes.DB_SYSTEM, 'postgresql');
```

### 4. Record Exceptions

```javascript
try {
  // operation
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  throw error;
}
```

### 5. Limit Cardinality

```javascript
// Good - low cardinality
span.setAttribute('http.method', 'GET');
span.setAttribute('http.status_code', 200);

// Bad - high cardinality (will cause storage issues)
span.setAttribute('user.email', user.email);
span.setAttribute('request.body', JSON.stringify(body));
```

---

## Production Checklist

- [ ] Tracing SDK initialized before app code
- [ ] Auto-instrumentation enabled for frameworks
- [ ] Context propagation configured
- [ ] Appropriate sampling rate set
- [ ] Collector/backend deployed and accessible
- [ ] Resource attributes (service name, version) set
- [ ] Error recording implemented
- [ ] Sensitive data not in spans
- [ ] Cardinality of attributes controlled
- [ ] Alerts set for trace collection issues
