import start from './tracer';
const { meter, logger } = start('todo-service');
import express from 'express';
import axios from 'axios';
import opentelemetry from "@opentelemetry/api";
import cors from 'cors';
import { connectDB } from './config/database';
import { Todo } from './models/Todo';
import { auth } from './middleware/auth';
import schedule from 'node-schedule';
import Redis from 'ioredis';
import mongoose from 'mongoose';

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

// Get all todos for authenticated user
app.get('/todos', auth, async (req, res) => {
  const span = tracer.startSpan('todo.list');
  
  try {
    const todos = await Todo.find({ userId: req.user._id });
    
    span.setAttribute('todo.count', todos.length);
    span.setAttribute('userId', req.user._id.toString());
    span.end();

    res.json({ todos, user: { username: req.user.username, userId: req.user._id } });
  } catch (error) {
    span.recordException(error as Error);
    span.end();
    res.status(500).json({ error: 'Error fetching todos' });
  }
});

// Create new todo
app.post('/todos', auth, async (req, res) => {
  const span = tracer.startSpan('todo.create');
  
  try {
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);
    console.log('User from auth middleware:', req.user);

    const { name, dueDate, reminderDate, priority, description } = req.body;
    
    // Validate required fields
    if (!name) {
      console.log('Validation failed: missing name');
      span.setAttribute('todo.create.error', 'missing_name');
      span.end();
      return res.status(400).json({ error: 'Todo name is required' });
    }

    // Create todo object with validation
    const todoData = {
      userId: req.user._id,
      name,
      description,
      priority: priority || 'medium',
      ...(dueDate && { dueDate: new Date(dueDate) }),
      ...(reminderDate && { reminderDate: new Date(reminderDate) })
    };

    console.log('Creating todo with data:', todoData);

    // Create and validate the todo instance
    const todo = new Todo(todoData);

    // Validate the todo object
    const validationError = todo.validateSync();
    if (validationError) {
      console.log('Mongoose validation error:', validationError);
      const errorMessages = Object.values(validationError.errors).map(err => err.message);
      console.log('Validation error messages:', errorMessages);
      
      span.setAttribute('todo.create.error', 'validation_error');
      span.recordException(validationError);
      span.end();
      
      return res.status(400).json({ 
        error: 'Validation error', 
        details: errorMessages
      });
    }

    // Save the todo
    await todo.save();
    console.log('Todo saved successfully:', todo);

    // Schedule reminder if reminderDate is set
    if (reminderDate) {
      scheduleReminder(todo._id.toString(), new Date(reminderDate), req.user._id.toString());
    }

    span.setAttribute('todo.id', todo._id.toString());
    span.setAttribute('userId', req.user._id.toString());
    span.end();

    res.status(201).json(todo);
  } catch (error: any) {
    console.error('Error creating todo:', error);
    console.error('Error stack:', error.stack);
    
    span.setAttribute('todo.create.error', error.name || 'unknown');
    span.recordException(error);
    span.end();
    
    // Handle different types of errors
    if (error.name === 'ValidationError') {
      const errorMessages = Object.values(error.errors).map((err: any) => err.message);
      console.log('Validation error messages:', errorMessages);
      return res.status(400).json({ 
        error: 'Validation error', 
        details: errorMessages
      });
    }
    
    logger.emit({
      severityText: 'ERROR',
      body: `Error creating todo: ${error.message}`,
      attributes: {
        error: error.message,
        stack: error.stack
      }
    });
    
    res.status(500).json({ error: 'Error creating todo', details: error.message });
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

    res.json(todo);
  } catch (error) {
    span.recordException(error as Error);
    span.end();
    res.status(500).json({ error: 'Error updating todo' });
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

    res.json({ message: 'Todo deleted successfully' });
  } catch (error) {
    span.recordException(error as Error);
    span.end();
    res.status(500).json({ error: 'Error deleting todo' });
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
app.get('/health', async (req, res) => {
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
    res.status(statusCode).json(healthStatus);
  } catch (error: any) {
    const healthStatus: HealthStatus = {
      status: 'unhealthy',
      mongo: 'disconnected',
      redis: 'disconnected',
      uptime: process.uptime(),
      error: error.message || 'Unknown error occurred'
    };

    span.recordException(error);
    res.status(503).json(healthStatus);
  } finally {
    span.end();
  }
});

// Error handling middleware must be last
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Global error handler:', err);
  
  // Create an error span
  const span = tracer.startSpan('error.handler');
  span.setAttributes({
    'error.type': err.name || 'UnknownError',
    'error.message': err.message || 'Unknown error occurred',
    'http.method': req.method,
    'http.url': req.url,
    'http.route': req.route?.path,
    'error.stack': err.stack || 'No stack trace available'
  });
  span.recordException(err);
  
  // Log with trace context (automatically included by our enhanced logger)
  logger.emit({
    severityText: 'ERROR',
    body: `Unhandled error: ${err.message}`,
    attributes: {
      error: err.message,
      stack: err.stack,
      method: req.method,
      url: req.url,
      route: req.route?.path
    }
  });
  
  span.end();
  res.status(500).json({ error: 'Internal server error' });
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
