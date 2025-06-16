# Observability in Cloud Native apps using OpenTelemetry

Welcome to the Observability in Cloud Native apps using OpenTelemetry repository! This repository contains a demo application that demonstrates how to implement comprehensive observability using OpenTelemetry, Grafana Alloy, Tempo, and other Grafana stack components.

## Architecture Overview

The application consists of several components:

1. **Frontend Service**: A web application instrumented with Grafana Faro for browser-based tracing
2. **Auth Service**: Handles user authentication and authorization
3. **Todo Service**: Manages todo items with Redis caching
4. **Observability Stack**:
   - Grafana Alloy: OpenTelemetry Collector
   - Tempo: Distributed tracing backend
   - Mimir: Metrics backend
   - Loki: Log aggregation
   - Grafana: Visualization platform

## Instrumentation Details

### Core Libraries Used

```json
{
  "@opentelemetry/api": "^1.4.1",
  "@opentelemetry/auto-instrumentations-node": "^0.38.0",
  "@opentelemetry/exporter-trace-otlp-proto": "^0.51.0",
  "@opentelemetry/exporter-metrics-otlp-proto": "^0.41.2",
  "@opentelemetry/exporter-logs-otlp-proto": "^0.45.0",
  "@opentelemetry/sdk-node": "^0.41.1",
  "@opentelemetry/sdk-metrics": "^1.15.1",
  "@opentelemetry/sdk-logs": "^0.45.0"
}
```

### Key Instrumentation Features

1. **Distributed Tracing**
   - Automatic instrumentation for HTTP, Express, and MongoDB
   - Custom span creation for business operations
   - Context propagation between services
   - Baggage support for cross-service attributes

2. **Metrics Collection**
   - Business metrics (todo operations, priorities, completion rates)
   - Performance metrics (API latency, cache hit ratio)
   - System metrics (MongoDB operations, connection pool)
   - Custom histograms and counters

3. **Logging**
   - Structured logging with trace context
   - Correlation between logs and traces
   - Automatic log enrichment with span attributes

4. **Frontend Instrumentation**
   - Browser-based tracing with Grafana Faro
   - Automatic instrumentation of fetch calls
   - User interaction tracking
   - Error monitoring


## Getting Started

1. **Clone the Repository:** 
```bash
git clone https://github.com/Vipan-arintech/opentelemetry-101-for-alloy-and-tempo.git
```

2. **Install dependencies and run with docker-compose:** 
```bash
npm install
docker-compose up -d
```

3. **Access the Services:**
   - Frontend: http://localhost:8082
   - Grafana: http://localhost:3000 (admin/admin)
   - Tempo: http://localhost:3200




## Core Instrumentation Architecture

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ParentBasedSampler } from '@opentelemetry/sdk-trace-base';
import { W3CBaggagePropagator, W3CTraceContextPropagator, CompositePropagator } from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
```

## ⚙️ Key Opentelemetry Implementation 

1. **Unified Telemetry Initialization**
```ts
function start(serviceName: string) {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: 'http://alloy:4318/v1/traces' }),
    serviceName,
    instrumentations: [getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-http": {
        headersToSpanAttributes: {
          client: { requestHeaders: ['tracestate', 'traceparent', 'baggage'] },
          server: { requestHeaders: ['tracestate', 'traceparent', 'baggage'] }
        }
      }
    })],
    resource: new Resource({
      'team.owner': 'core-team',
      'deployment': '4'
    }),
    sampler: new ParentBasedSampler({ root: new OurSampler() }),
    textMapPropagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()]
    })
  });
  sdk.start();
}

```

2. **Trace-Context Logging** 

Automatically injects trace context into all logs:

```ts
function getLogger(serviceName: string = 'default-service') {
  return {
    emit: (logRecord: any) => {
      const traceContext = getTraceContext(); // Gets current trace/span IDs
      baseLogger.emit({
        ...logRecord,
        attributes: { ...logRecord.attributes, ...traceContext }
      });
    }
  };
}

function getTraceContext() {
  const span = trace.getActiveSpan();
  return span ? {
    'trace.id': span.spanContext().traceId,
    'span.id': span.spanContext().spanId,
    'trace.flags': span.spanContext().traceFlags.toString(16)
  } : {};
}

```

3. **Advanced Resource Tagging**
```ts
new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
  [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version,
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
  'team.owner': 'core-team',
  'deployment.id': process.env.DEPLOYMENT_ID,
  'application.name': 'todo-app'
})

```

4. **Propagators Configuration**
```ts
textMapPropagator: new CompositePropagator({
  propagators: [
    new W3CTraceContextPropagator(),  // W3C Trace Context standard
    new W3CBaggagePropagator()        // Baggage support
  ]
})

```

5. **Metrics Pipeline**
```ts
const meterProvider = new MeterProvider({
  resource: new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: serviceName })
});

meterProvider.addMetricReader(new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({ url: 'http://alloy:4318/v1/metrics' })
}));

```

6. **Logs Pipeline**
```ts
const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(
  new OTLPLogExporter({ url: 'http://alloy:4318/v1/logs' })
));

```








## Key Features Demonstrated

1. **Distributed Tracing**
   - End-to-end request tracing
   - Service dependency visualization
   - Latency analysis
   - Error tracking

2. **Metrics**
   - Business KPIs
   - Performance metrics
   - Resource utilization
   - Custom metrics

3. **Logging**
   - Structured logging
   - Log-trace correlation
   - Error tracking
   - Debug logs

4. **Advanced Features**
   - Custom sampling
   - Resource attributes
   - Baggage propagation
   - Tail sampling
   - Service graphs

## Contributing

Feel free to submit issues and enhancement requests!
