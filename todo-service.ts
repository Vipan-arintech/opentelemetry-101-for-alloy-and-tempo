import start from './tracer';
const { logger, meter } = start('todo-service');
import express, { Request, Response, NextFunction } from 'express';
import opentelemetry, { SpanStatusCode } from "@opentelemetry/api";
import cors from 'cors';
import { connectDB } from './config/database';
import { Todo } from './models/Todo';
import { auth } from './middleware/auth';
import schedule from 'node-schedule';
import Redis from 'ioredis';
import mongoose from 'mongoose';
import { context, propagation } from '@opentelemetry/api';

// Business metrics
const todoOperations = meter.createHistogram('todo.operations', {
  description: 'Todo operations with duration',
  unit: 'ms',
});

const todoPriorities = meter.createUpDownCounter('todo.priorities', {
  description: 'Number of todos by priority level'
});

const todoCompletionRate = meter.createHistogram('todo.completion_rate', {
  description: 'Time taken to complete todos',
  unit: 'ms'
});

const userActivityGauge = meter.createUpDownCounter('user.activity', {
  description: 'User activity metrics'
});

const reminderMetrics = meter.createHistogram('todo.reminders', {
  description: 'Reminder scheduling and execution metrics',
  unit: 'ms'
});

// Performance metrics
const apiLatency = meter.createHistogram('api.latency', {
  description: 'API endpoint latency',
  unit: 'ms'
});

const cacheHitRatio = meter.createUpDownCounter('cache.hit_ratio', {
  description: 'Redis cache hit ratio'
});

// Error metrics
const errorRate = meter.createCounter('error.rate', {
  description: 'Error occurrence rate by type'
});

// Extend Express Request type
declare module 'express-serve-static-core' {
  interface Request {
    baggageUser?: {
      id: string;
      name: string;
    };
    user: {
      _id: string;
      id: string;
      username: string;
    };
  }
}

const app = express();
const tracer = opentelemetry.trace.getTracer('todo-service');

// Initialize Redis client with error handling
const redis = new Redis({
  host: 'redis',
  port: 6379,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('error', (error: Error) => {
  logger.emit({
    severityText: 'ERROR',
    body: `Redis connection error: ${error.message}`,
    attributes: {
      error: error.message
    }
  });
});

redis.on('connect', () => {
  logger.emit({
    severityText: 'INFO',
    body: 'Redis connected successfully',
  });
});

// CORS middleware must be first
app.use(cors({
  origin: ['http://localhost:8082', 'http://127.0.0.1:8082'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'traceparent', 'tracestate']
}));

// Other middleware
app.use(express.json());

// Middleware to extract user from baggage
app.use((_req: Request, _res: Response, next: NextFunction) => {
  const activeContext = context.active();
  const baggage = propagation.getBaggage(activeContext);
  if (baggage) {
    const userId = baggage.getEntry('user.id')?.value;
    const userName = baggage.getEntry('user.name')?.value;
    if (userId && userName) {
      _req.baggageUser = { id: userId, name: userName };
    }
  }
  next();
});

// Connect to MongoDB
connectDB().catch((error: Error) => {
  logger.emit({
    severityText: 'ERROR',
    body: `MongoDB connection error: ${error.message}`,
    attributes: {
      error: error.message
    }
  });
});

// Initialize scheduler for reminders
const reminderJobs = new Map();

function scheduleReminder(todoId: string, reminderDate: Date, userId: string) {
  if (reminderJobs.has(todoId)) {
    reminderJobs.get(todoId).cancel();
  }

  const job = schedule.scheduleJob(reminderDate, async () => {
    const span = tracer.startSpan('todo.reminder');
    try {
      const todo = await Todo.findById(todoId);
      if (todo) {
        logger.emit({
          severityText: 'INFO',
          body: `Reminder: Todo "${todo.name}" is due soon`,
          attributes: {
            todoId,
            userId,
            todoName: todo.name
          }
        });
      }
      span.end();
    } catch (error) {
      span.recordException(error as Error);
      span.end();
    }
  });

  reminderJobs.set(todoId, job);
}

// Add request timing middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const span = tracer.startSpan('http.request');
  
  span.setAttributes({
    'http.method': req.method,
    'http.url': req.url,
    'http.host': req.headers.host || '',
    'http.user_agent': req.headers['user-agent'] || ''
  });

  // Add trace context to response headers
  const currentContext = context.active();
  const traceHeaders: Record<string, string> = {};
  propagation.inject(currentContext, traceHeaders);
  Object.entries(traceHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    apiLatency.record(duration, {
      route: req.route?.path || req.path,
      method: req.method,
      status_code: res.statusCode.toString()
    });

    span.setAttributes({
      'http.status_code': res.statusCode,
      'http.response_time_ms': duration
    });
    
    if (res.statusCode >= 400) {
      errorRate.add(1, {
        route: req.route?.path || req.path,
        status_code: res.statusCode.toString()
      });
    }
    
    span.end();
  });

  next();
});

// Get all todos for authenticated user
app.get('/todos', auth, async (req: Request, res: Response) => {
  const span = tracer.startSpan('todo.list');
  const startTime = Date.now();
  
  try {
    const userId = req.user.id;
    const baggage = propagation.getBaggage(context.active());
    const userName = baggage?.getEntry('user.name')?.value;
    const userRole = baggage?.getEntry('user.role')?.value;

    // Try cache first
    const cacheKey = `todos:${userId}`;
    const cachedTodos = await redis.get(cacheKey);
    
    let todos;
    if (cachedTodos) {
      todos = JSON.parse(cachedTodos);
      cacheHitRatio.add(1, { operation: 'get_todos' });
      span.setAttribute('cache.hit', true);
    } else {
      todos = await Todo.find({ userId }).sort({ createdAt: -1 });
      await redis.setex(cacheKey, 300, JSON.stringify(todos)); // Cache for 5 minutes
      cacheHitRatio.add(0, { operation: 'get_todos' });
      span.setAttribute('cache.hit', false);
    }

    // Record business metrics
    const completedTodos = todos.filter((todo: any) => todo.completed);
    const priorityCount = todos.reduce((acc: any, todo: any) => {
      acc[todo.priority] = (acc[todo.priority] || 0) + 1;
      return acc;
    }, {});

    Object.entries(priorityCount).forEach(([priority, count]) => {
      todoPriorities.add(count as number, { priority });
    });

    userActivityGauge.add(1, { 
      user_id: userId,
      operation: 'list_todos'
    });
    
    span.setAttributes({
      'user.id': userId,
      'user.name': userName || 'unknown',
      'user.role': userRole || 'unknown',
      'todo.count': todos.length,
      'todo.completed_count': completedTodos.length,
      'todo.completion_rate': todos.length ? completedTodos.length / todos.length : 0
    });

    todoOperations.record(Date.now() - startTime, {
      operation: 'list',
      user_id: userId
    });

    span.end();
    return res.json({ 
      todos, 
      user: { 
        username: userName || req.user.username, 
        userId 
      } 
    });
  } catch (error) {
    const err = error as Error;
    errorRate.add(1, {
      operation: 'list_todos',
      error_type: err.name,
      error_message: err.message
    });
    
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
    
    return res.status(500).json({ error: 'Error fetching todos' });
  }
});

// Create new todo
app.post('/todos', auth, async (req: Request, res: Response) => {
  const span = tracer.startSpan('todo.create');
  const startTime = Date.now();
  
  try {
    const { name, dueDate, reminderDate, priority, description } = req.body;
    const baggage = propagation.getBaggage(context.active());
    const userName = baggage?.getEntry('user.name')?.value;
    
    if (!name) {
      errorRate.add(1, {
        operation: 'create_todo',
        error_type: 'validation',
        error_message: 'missing_name'
      });
      
      span.setAttribute('error', 'missing_name');
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      
      return res.status(400).json({ error: 'Todo name is required' });
    }

    const todoData = {
      userId: req.user._id,
      name,
      description,
      priority: priority || 'medium',
      ...(dueDate && { dueDate: new Date(dueDate) }),
      ...(reminderDate && { reminderDate: new Date(reminderDate) })
    };

    const todo = new Todo(todoData);
    await todo.save();

    // Invalidate cache
    await redis.del(`todos:${req.user._id}`);

    if (reminderDate) {
      const reminderSpan = tracer.startSpan('schedule.reminder', {
        attributes: {
          'todo.id': todo._id.toString(),
          'reminder.date': reminderDate
        }
      });
      
      scheduleReminder(todo._id.toString(), new Date(reminderDate), req.user._id.toString());
      
      reminderMetrics.record(new Date(reminderDate).getTime() - Date.now(), {
        todo_id: todo._id.toString(),
        user_id: req.user._id.toString()
      });
      
      reminderSpan.end();
    }

    // Record business metrics
    todoPriorities.add(1, { priority: todo.priority });
    userActivityGauge.add(1, {
      user_id: req.user._id.toString(),
      operation: 'create_todo'
    });

    todoOperations.record(Date.now() - startTime, {
      operation: 'create',
      priority: todo.priority,
      has_reminder: !!reminderDate
    });

    span.setAttributes({
      'todo.id': todo._id.toString(),
      'user.id': req.user._id.toString(),
      'user.name': userName || 'unknown',
      'todo.name': name,
      'todo.priority': priority || 'medium',
      'todo.has_reminder': !!reminderDate,
      'operation.duration_ms': Date.now() - startTime
    });

    span.end();
    return res.status(201).json(todo);
  } catch (error) {
    const err = error as Error;
    errorRate.add(1, {
      operation: 'create_todo',
      error_type: err.name,
      error_message: err.message
    });
    
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
    
    return res.status(500).json({ error: 'Error creating todo' });
  }
});

// Update todo
app.put('/todos/:id', auth, async (req, res) => {
  const span = tracer.startSpan('todo.update');
  
  try {
    const { name, completed, dueDate, reminderDate, priority, description } = req.body;
    
    const todo = await Todo.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!todo) {
      span.setAttribute('todo.status', 'not_found');
      span.end();
      return res.status(404).json({ error: 'Todo not found' });
    }

    // Update fields
    todo.name = name || todo.name;
    todo.completed = completed !== undefined ? completed : todo.completed;
    todo.dueDate = dueDate || todo.dueDate;
    todo.reminderDate = reminderDate || todo.reminderDate;
    todo.priority = priority || todo.priority;
    todo.description = description || todo.description;

    await todo.save();

    // Update reminder if reminderDate changed
    if (reminderDate) {
      scheduleReminder(todo._id.toString(), new Date(reminderDate), req.user._id.toString());
    }

    span.setAttribute('todo.id', todo._id.toString());
    span.setAttribute('userId', req.user._id.toString());
    span.end();

    return res.json(todo);
  } catch (error) {
    span.recordException(error as Error);
    span.end();
    return res.status(500).json({ error: 'Error updating todo' });
  }
});

// Delete todo
app.delete('/todos/:id', auth, async (req, res) => {
  const span = tracer.startSpan('todo.delete');
  
  try {
    const todo = await Todo.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    
    if (!todo) {
      span.setAttribute('todo.status', 'not_found');
      span.end();
      return res.status(404).json({ error: 'Todo not found' });
    }

    // Cancel any scheduled reminder
    if (reminderJobs.has(req.params.id)) {
      reminderJobs.get(req.params.id).cancel();
      reminderJobs.delete(req.params.id);
    }

    span.setAttribute('todo.id', req.params.id);
    span.setAttribute('userId', req.user._id.toString());
    span.end();

    return res.json({ message: 'Todo deleted successfully' });
  } catch (error) {
    span.recordException(error as Error);
    span.end();
    return res.status(500).json({ error: 'Error deleting todo' });
  }
});

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  mongo: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
  uptime: number;
  error?: string;
}

// Health check endpoint
app.get('/health', async (_req, res) => {
  const span = tracer.startSpan('health.check');
  
  try {
    // Check MongoDB connection
    const mongoStatus = mongoose.connection.readyState === 1;
    
    // Check Redis connection
    const redisStatus = redis.status === 'ready';

    const healthStatus: HealthStatus = {
      status: (mongoStatus && redisStatus) ? 'healthy' : 'unhealthy',
      mongo: mongoStatus ? 'connected' : 'disconnected',
      redis: redisStatus ? 'connected' : 'disconnected',
      uptime: process.uptime()
    };

    span.setAttributes({
      'health.status': healthStatus.status,
      'mongo.status': healthStatus.mongo,
      'redis.status': healthStatus.redis
    });

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    return res.status(statusCode).json(healthStatus);
  } catch (error: any) {
    const healthStatus: HealthStatus = {
      status: 'unhealthy',
      mongo: 'disconnected',
      redis: 'disconnected',
      uptime: process.uptime(),
      error: error.message || 'Unknown error occurred'
    };

    span.recordException(error);
    return res.status(503).json(healthStatus);
  } finally {
    span.end();
  }
});

// Error handling middleware must be last
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Global error handler:', err);
  
  // Create an error span
  const span = tracer.startSpan('error.handler');
  span.setAttributes({
    'error.type': err.name || 'UnknownError',
    'error.message': err.message || 'Unknown error occurred',
    'error.stack': err.stack || 'No stack trace available'
  });
  span.recordException(err);
  
  // Log with trace context
  logger.emit({
    severityText: 'ERROR',
    body: `Unhandled error: ${err.message}`,
    attributes: {
      error: err.message,
      stack: err.stack
    }
  });
  
  span.end();
  return res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 8080;  // Match docker-compose environment variable
const server = app.listen(PORT, () => {
    logger.emit({
        severityText: 'INFO',
        body: `Todo service is running on port ${PORT}!`,
        attributes: {
            port: PORT
        }
    });
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.emit({
    severityText: 'INFO',
    body: 'SIGTERM received, shutting down gracefully'
  });

  // Cancel all scheduled jobs
  for (const [todoId, job] of reminderJobs.entries()) {
    job.cancel();
    reminderJobs.delete(todoId);
  }

  // Close server
  server.close(() => {
    logger.emit({
      severityText: 'INFO',
      body: 'HTTP server closed'
    });
  });

  try {
    // Disconnect Redis
    await redis.quit();
    logger.emit({
      severityText: 'INFO',
      body: 'Redis connection closed'
    });

    // Disconnect MongoDB
    await mongoose.connection.close();
    logger.emit({
      severityText: 'INFO',
      body: 'MongoDB connection closed'
    });

    process.exit(0);
  } catch (error: any) {
    logger.emit({
      severityText: 'ERROR',
      body: `Error during graceful shutdown: ${error.message}`,
      attributes: {
        error: error.message
      }
    });
    process.exit(1);
  }
});

async function init() {
    opentelemetry.trace.getTracer('init').startActiveSpan('Set default items', async (span) => {
        const traceId = span.spanContext().traceId;
        const spanId = span.spanContext().spanId;

        logger.emit({
            severityText: 'INFO',
            body: 'Initializing default todo items',
            attributes: {
                traceId,
                spanId
            }
        });

        await Promise.all([
            redis.set('todo:1', JSON.stringify({ name: 'Install OpenTelemetry SDK' })),
            redis.set('todo:2', JSON.stringify({ name: 'Deploy OpenTelemetry Collector' })),
            redis.set('todo:3', JSON.stringify({ name: 'Configure sampling rule' })),
            redis.set('todo:4', JSON.stringify({ name: 'You are OpenTelemetry master!' }))
        ]);

        logger.emit({
            severityText: 'INFO',
            body: 'Default todo items initialized',
            attributes: {
                traceId,
                spanId
            }
        });

        span.end();
    });
}

init();
