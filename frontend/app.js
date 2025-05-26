import { initializeFaro, getWebInstrumentations } from 'https://esm.sh/@grafana/faro-web-sdk@1.3.5';
import { TracingInstrumentation } from 'https://esm.sh/@grafana/faro-web-tracing@1.3.5';

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
        propagateTraceHeaderCorsUrls: [/.*/], // Allow trace header propagation for all URLs
      },
    }),
  ],
});

// get OTel trace and context APIs
const { trace, context } = faro.api.getOTEL();

const backendUrl = 'http://localhost:8081/todos';
// const backendUrl = 'http://todo:8080/todos';

// Fetch todos and populate table
async function fetchTodos() {
  const tracer = trace.getTracer('todos-frontend');
  const span = tracer.startSpan('fetchTodos');

  try {
    await context.with(trace.setSpan(context.active(), span), async () => {
      const response = await fetch(backendUrl, {
        // Enable CORS and credentials to ensure trace headers are sent
        mode: 'cors',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`Network response was not ok (${response.status})`);
      }

      // Parse the JSON payload
      const { todos, user } = await response.json();

      // Get table body and clear existing rows
      const tbody = document.getElementById('todosBody');
      tbody.innerHTML = '';

      // Populate table with trace context
      todos.forEach(({ name }) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${user.username}</td>
          <td>${user.userId}</td>
          <td>${name}</td>
        `;
        tbody.appendChild(row);

        // Log each todo with trace context
        faro.api.pushLog(['Todo loaded:', name], {
          level: 'info',
          context: {
            todoName: name,
            userId: user.userId
          }
        });
      });

      // Track successful load with Faro and trace context
      faro.api.pushEvent('todos_loaded', {
        count: todos.length.toString(),
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId
      });
      
      span.end();
    });
  } catch (error) {
    console.error('Error fetching todos:', error);
    
    // Add trace context to error
    const spanContext = span.spanContext();
    span.recordException(error);
    span.setStatus({ code: 'ERROR', message: error.message });
    span.end();
    
    faro.api.pushError(error, {
      context: {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId
      }
    });
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', fetchTodos);






































// const backendUrl = 'http://todo:8080/todos';
// // Fetch todos and populate table
// async function fetchTodos() {
//     try {
//         const response = await fetch(backendUrl);
//         if (!response.ok) throw new Error('Network response was not ok');
        
//         const data = await response.json();
//         const tbody = document.getElementById('todosBody');
        
//         data.todos.forEach(todo => {
//             const row = document.createElement('tr');
//             row.innerHTML = `
//                 <td>${data.user.username}</td>
//                 <td>${data.user.userId}</td>
//                 <td>${todo.name}</td>
//             `;
//             tbody.appendChild(row);
//         });

//         // Track successful load
//         faro.api.pushEvent('todos_loaded', { count: data.todos.length.toString() });
//     } catch (error) {
//         console.error('Error fetching todos:', error);
//         faro.api.pushError(error);
//     }
// }

// // Initialize when page loads
// document.addEventListener('DOMContentLoaded', fetchTodos);