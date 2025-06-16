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

## Course Progression

This course is built in a way that we start with a simple application and add more OpenTelemetry functionality in each section. Below is a table with all the available tags:

| Tag | Description |
| ------------- | ------------- |
| 1 | Before we install OpenTelemetry |
| 2 | Basic OpenTelemetry installation |
| 3 | Adding Metrics |
| 4 | Correlating logs with traces |
| 5 | Creating manual spans |
| 6 | Adding custom attributes |
| 7 | Debug logs |
| 8 | Define custom resources |
| 9 | Configure custom sampler |
| 10 | Using context propagation to set baggage |
| 11-v2 | Using the OpenTelemetry Collector |
| 12-v2 | Setting up tail sampling |

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

4. **Creating Trace Dashboard**
   Use the Trace-Dashboard.json file to create the dashboard in Grafana.

![Trace Dashboard](https://github.com/user-attachments/assets/515bd91f-728f-4e4f-95dd-e575f4437bf9)

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
