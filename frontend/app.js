// import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
// import { TracingInstrumentation } from '@grafana/faro-web-tracing';

// const faro = initializeFaro({
//   url: 'http://localhost:12345/collect',
//   app: {
//     name: 'frontend',
//     version: '1.0.0',
//   },
//   instrumentations: [
//     ...getWebInstrumentations(),
//     new TracingInstrumentation(),
//   ],
// });

// // get OTel trace and context APIs
// const { trace, context } = faro.api.getOTEL();

// const tracer = trace.getTracer('default');
// const span = tracer.startSpan('click');
// context.with(trace.setSpan(context.active(), span), () => {
//   doSomething();
//   span.end();
// });


///////////////////////////////////////////


const backendUrl = 'http://localhost:8081/todos';
// const backendUrl = 'http://todo:8080/todos';

// Fetch todos and populate table
async function fetchTodos() {
  try {
    const response = await fetch(backendUrl);
    if (!response.ok) {
      throw new Error(`Network response was not ok (${response.status})`);
    }

    // Parse the JSON payload
    const { todos, user } = await response.json();

    // Get table body and clear existing rows
    const tbody = document.getElementById('todosBody');
    tbody.innerHTML = '';

    // Populate table
    todos.forEach(({ name }) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${user.username}</td>
        <td>${user.userId}</td>
        <td>${name}</td>
      `;
      tbody.appendChild(row);
    });

    // Track successful load with Faro
    faro.api.pushEvent('todos_loaded', { count: todos.length.toString() });
  } catch (error) {
    console.error('Error fetching todos:', error);
    faro.api.pushError(error);
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