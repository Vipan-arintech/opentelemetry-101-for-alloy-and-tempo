import mongoose from 'mongoose';
import { trace, metrics } from '@opentelemetry/api';
import start from '../tracer';

const { logger, meter } = start('database');
const tracer = trace.getTracer('mongodb-tracer');

// Create detailed MongoDB metrics
const mongoOperations = meter.createCounter('mongodb.operations', {
  description: 'Number of MongoDB operations'
});

const mongoOperationDuration = meter.createHistogram('mongodb.operation.duration', {
  description: 'Duration of MongoDB operations'
});

const mongoConnectionAttempts = meter.createCounter('mongodb.connection.attempts', {
  description: 'Number of MongoDB connection attempts'
});

const mongoErrors = meter.createCounter('mongodb.errors', {
  description: 'Number of MongoDB errors'
});

// Additional MongoDB metrics
const mongoConnectionPoolSize = meter.createUpDownCounter('mongodb.pool.size', {
  description: 'MongoDB connection pool size'
});

const mongoActiveConnections = meter.createUpDownCounter('mongodb.connections.active', {
  description: 'Number of active MongoDB connections'
});

const mongoQueuedOperations = meter.createUpDownCounter('mongodb.operations.queued', {
  description: 'Number of queued MongoDB operations'
});

const mongoCollectionMetrics = meter.createHistogram('mongodb.collection.metrics', {
  description: 'MongoDB collection-level metrics'
});

// Monitor MongoDB operations
mongoose.connection.on('query', (query) => {
  const startTime = Date.now();
  const span = tracer.startSpan('mongodb.query', {
    attributes: {
      'db.operation': query.operation,
      'db.collection': query.collection,
      'db.query': JSON.stringify(query.query || {}),
      'db.namespace': `${query.db}.${query.collection}`
    }
  });
  
  mongoOperations.add(1, {
    operation: query.operation,
    collection: query.collection
  });

  // Record operation duration when it completes
  query.once('complete', () => {
    const duration = Date.now() - startTime;
    mongoOperationDuration.record(duration, {
      operation: query.operation,
      collection: query.collection,
      status: 'success'
    });

    mongoCollectionMetrics.record(duration, {
      collection: query.collection,
      operation: query.operation,
      status: 'success'
    });

    logger.emit({
      severityText: 'DEBUG',
      body: `MongoDB operation completed: ${query.operation}`,
      attributes: {
        'db.operation': query.operation,
        'db.collection': query.collection,
        'db.duration_ms': duration,
        'db.status': 'success'
      }
    });

    span.setAttributes({
      'db.duration_ms': duration,
      'db.status': 'success'
    });
    span.end();
  });

  // Record operation errors
  query.once('error', (error: Error) => {
    const duration = Date.now() - startTime;
    mongoOperationDuration.record(duration, {
      operation: query.operation,
      collection: query.collection,
      status: 'error',
      error_type: error.name
    });

    mongoErrors.add(1, {
      operation: query.operation,
      collection: query.collection,
      error_type: error.name,
      error_message: error.message
    });

    logger.emit({
      severityText: 'ERROR',
      body: `MongoDB operation failed: ${query.operation}`,
      attributes: {
        'db.operation': query.operation,
        'db.collection': query.collection,
        'db.duration_ms': duration,
        'db.error': error.message,
        'db.error_type': error.name
      }
    });

    span.recordException(error);
    span.setAttributes({
      'db.duration_ms': duration,
      'db.status': 'error',
      'error.type': error.name,
      'error.message': error.message
    });
    span.end();
  });
});

// Monitor connection pool events
mongoose.connection.on('connected', () => {
  const span = tracer.startSpan('mongodb.connect');
  logger.emit({
    severityText: 'INFO',
    body: 'Connected to MongoDB successfully',
    attributes: {
      'db.pool.size': mongoose.connection.client?.topology?.connections?.length || 0
    }
  });
  span.end();
});

mongoose.connection.on('disconnected', () => {
  const span = tracer.startSpan('mongodb.disconnect');
  logger.emit({
    severityText: 'WARN',
    body: 'MongoDB disconnected',
    attributes: {
      'db.last_error': mongoose.connection.lastError || null
    }
  });
  span.end();
});

// Monitor connection pool metrics
setInterval(() => {
  if (mongoose.connection.client?.topology) {
    const poolSize = mongoose.connection.client.topology.connections?.length || 0;
    const activeConnections = mongoose.connection.client.topology.connections?.filter(
      (conn: any) => conn.active
    ).length || 0;
    
    mongoConnectionPoolSize.add(poolSize - (mongoConnectionPoolSize as any).value || 0);
    mongoActiveConnections.add(activeConnections - (mongoActiveConnections as any).value || 0);
    
    logger.emit({
      severityText: 'DEBUG',
      body: 'MongoDB connection pool metrics',
      attributes: {
        'db.pool.size': poolSize,
        'db.pool.active': activeConnections
      }
    });
  }
}, 5000); // Update every 5 seconds

export async function connectDB() {
  const span = tracer.startSpan('mongodb.connect');
  
  try {
    mongoose.set('strictQuery', false);
    
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/todo-app';
    
    mongoConnectionAttempts.add(1);
    
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
    });

    // Add initial connection metrics
    const poolSize = mongoose.connection.client?.topology?.connections?.length || 0;
    mongoConnectionPoolSize.add(poolSize);
    
    logger.emit({
      severityText: 'INFO',
      body: 'MongoDB connection established',
      attributes: {
        'db.uri': mongoURI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
        'db.pool.size': poolSize,
        'db.version': mongoose.version
      }
    });

    span.setAttributes({
      'db.system': 'mongodb',
      'db.connection_string': mongoURI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
      'db.pool.size': poolSize
    });
    span.end();

  } catch (error: any) {
    mongoErrors.add(1, {
      operation: 'connect',
      error_type: error.name,
      error_message: error.message
    });

    logger.emit({
      severityText: 'ERROR',
      body: 'Failed to connect to MongoDB',
      attributes: {
        'error.type': error.name,
        'error.message': error.message,
        'error.stack': error.stack
      }
    });

    span.recordException(error);
    span.end();
    throw error;
  }
} 