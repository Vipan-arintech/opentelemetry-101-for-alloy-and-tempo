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
