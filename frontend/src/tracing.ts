import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { CompositePropagator, W3CTraceContextPropagator, W3CBaggagePropagator } from '@opentelemetry/core';

// Initialize the tracer
const provider = new WebTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'frontend',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  }),
});

// Configure the OTLP exporter
const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});

// Add the exporter to the provider
provider.addSpanProcessor(new BatchSpanProcessor(exporter));

// Set up context propagation
provider.register({
  contextManager: new ZoneContextManager(),
  propagator: new CompositePropagator({
    propagators: [
      new W3CTraceContextPropagator(),
      new W3CBaggagePropagator()
    ],
  }),
});

// Register auto-instrumentations
registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: [/.*/],  // Propagate to all URLs
      clearTimingResources: true,
    }),
  ],
});

// Export helper for creating fetch headers with trace context
export function createFetchHeaders(additionalHeaders = {}) {
  const currentSpan = trace.getActiveSpan();
  if (!currentSpan) {
    return new Headers(additionalHeaders);
  }

  const headers = new Headers(additionalHeaders);
  const ctx = trace.setSpan(context.active(), currentSpan);
  propagation.inject(ctx, headers);
  
  return headers;
}

// Export trace API for manual instrumentation
export const { trace, context, propagation } = require('@opentelemetry/api'); 