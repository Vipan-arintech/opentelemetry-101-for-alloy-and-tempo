import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import { propagation } from '@opentelemetry/api';
import flatpickr from 'flatpickr';

// Initialize Faro with web instrumentations and tracing
const faro = initializeFaro({
  url: 'http://localhost:12346/collect',
  app: {
    name: 'frontend',
    version: '1.0.0',
  },
  instrumentations: [
    ...getWebInstrumentations(),
    new TracingInstrumentation({
      instrumentationOptions: {
        propagateTraceHeaderCorsUrls: [/.*/],
      },
    }),
  ],
});

// Get OTel trace and context APIs
const { trace, context } = faro.api.getOTEL();

// API URLs - update these to match your environment
const AUTH_URL = '/auth';
const TODO_URL = '/todos';

// Initialize date pickers
flatpickr("#todoDueDate", {
  enableTime: true,
  dateFormat: "Y-m-d H:i",
});

flatpickr("#todoReminderDate", {
  enableTime: true,
  dateFormat: "Y-m-d H:i",
});

// ... rest of the existing code ... 