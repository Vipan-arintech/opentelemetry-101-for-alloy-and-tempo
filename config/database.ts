import mongoose from 'mongoose';
import { trace, metrics } from '@opentelemetry/api';
import start from '../tracer';

const { logger, meter } = start('database');
const tracer = trace.getTracer('mongodb-tracer');

// Create metrics
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

// Monitor MongoDB operations
mongoose.connection.on('query', (query) => {
  const startTime = Date.now();
  
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
  });
});

export async function connectDB() {
  const span = tracer.startSpan('mongodb.connect');
  
  try {
    // Set strictQuery to false to prepare for Mongoose 7
    mongoose.set('strictQuery', false);
    
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/todo-app';
    
    // Configure mongoose connection
    mongoose.connection.on('connected', () => {
      logger.emit({
        severityText: 'INFO',
        body: 'Connected to MongoDB successfully',
        attributes: {
          mongoUri: mongoURI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') // Hide credentials in logs
        }
      });
    });

    mongoose.connection.on('error', (error) => {
      mongoErrors.add(1, {
        errorType: error.name,
        errorMessage: error.message
      });

      logger.emit({
        severityText: 'ERROR',
        body: 'MongoDB connection error',
        attributes: {
          error: error.message,
          errorType: error.name
        }
      });
      span.recordException(error);
    });

    mongoose.connection.on('disconnected', () => {
      logger.emit({
        severityText: 'WARN',
        body: 'MongoDB disconnected'
      });
    });

    mongoose.connection.on('reconnected', () => {
      logger.emit({
        severityText: 'INFO',
        body: 'MongoDB reconnected'
      });
    });

    // Connect with retry logic and instrumentation
    const connectWithRetry = async (retries = 5, interval = 5000) => {
      try {
        mongoConnectionAttempts.add(1, {
          attempt: 6 - retries // Convert retries left to attempt number
        });

        await mongoose.connect(mongoURI, {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        });

        // Add connection metrics
        meter.createUpDownCounter('mongodb.connection.status').add(1);
        
        span.end();
      } catch (error: any) {
        if (retries === 0) {
          logger.emit({
            severityText: 'ERROR',
            body: 'Failed to connect to MongoDB after multiple retries',
            attributes: {
              error: error.message
            }
          });
          span.recordException(error);
          span.end();
          process.exit(1);
        }

        logger.emit({
          severityText: 'WARN',
          body: `Retrying MongoDB connection in ${interval}ms`,
          attributes: {
            retriesLeft: retries - 1,
            nextAttemptIn: interval
          }
        });

        setTimeout(() => connectWithRetry(retries - 1, interval), interval);
      }
    };

    await connectWithRetry();

    // Handle process termination
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.emit({
          severityText: 'INFO',
          body: 'MongoDB connection closed through app termination'
        });
        process.exit(0);
      } catch (error: any) {
        logger.emit({
          severityText: 'ERROR',
          body: 'Error closing MongoDB connection',
          attributes: {
            error: error.message
          }
        });
        process.exit(1);
      }
    });

  } catch (error: any) {
    logger.emit({
      severityText: 'ERROR',
      body: 'Error connecting to MongoDB',
      attributes: {
        error: error.message
      }
    });
    span.recordException(error);
    span.end();
    process.exit(1);
  }
} 