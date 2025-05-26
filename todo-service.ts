import start from './tracer';
const { meter, logger } = start('todo-service');
import express from 'express';
import axios from 'axios';
import opentelemetry from "@opentelemetry/api";
import cors from 'cors';
const app = express();

app.use(express.json());

// Configure CORS for frontend with credentials
app.use(cors({
  origin: 'http://localhost:8082',  // Frontend origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'traceparent', 'tracestate']
}));

import Redis from "ioredis";
import { api } from '@opentelemetry/sdk-node';
const redis = new Redis({ host: 'redis' });

const calls = meter.createHistogram('http-calls');

// Add request logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    const activeSpan = api.trace.getSpan(api.context.active());
    const traceId = activeSpan?.spanContext().traceId;
    const spanId = activeSpan?.spanContext().spanId;

    // Log the incoming request
    logger.emit({
        severityText: 'INFO',
        body: `Incoming ${req.method} request to ${req.path}`,
        attributes: {
            traceId,
            spanId,
            http: {
                method: req.method,
                url: req.url,
                userAgent: req.get('user-agent')
            }
        }
    });

    req.on('end', () => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        calls.record(duration, {
            route: req.route?.path,
            status: res.statusCode,
            method: req.method
        });

        // Log the completed request
        logger.emit({
            severityText: res.statusCode >= 400 ? 'ERROR' : 'INFO',
            body: `Completed ${req.method} ${req.path} with status ${res.statusCode}`,
            attributes: {
                traceId,
                spanId,
                http: {
                    method: req.method,
                    url: req.url,
                    statusCode: res.statusCode,
                    duration
                }
            }
        });
    });
    next();
});

const sleep = (time: number) => { return new Promise((resolve) => { setTimeout(resolve, time) }) };

app.get('/todos', async (req, res) => {
    const baggage = opentelemetry.propagation.createBaggage({
        "user.plan": {
            value: "enterprise"
        }
    });
    const contextWithBaggage = opentelemetry.propagation.setBaggage(opentelemetry.context.active(), baggage);
    opentelemetry.context.with(contextWithBaggage, async () => {
        try {
            const activeSpan = api.trace.getSpan(api.context.active());
            const traceId = activeSpan?.spanContext().traceId;
            const spanId = activeSpan?.spanContext().spanId;

            logger.emit({
                severityText: 'INFO',
                body: 'Fetching todos',
                attributes: {
                    traceId,
                    spanId,
                    'user.plan': 'enterprise'
                }
            });

            const user = await axios.get('http://auth:8080/auth');
            const todoKeys = await redis.keys('todo:*');
            const todos: any = [];
            
            for (let i = 0; i < todoKeys.length; i++) {
                const todoItem = await redis.get(todoKeys[i]);
                if (todoItem) {
                    todos.push(JSON.parse(todoItem));
                }
            }

            if (req.query['slow']) {
                logger.emit({
                    severityText: 'INFO',
                    body: 'Slow mode enabled, adding delay',
                    attributes: { traceId, spanId }
                });
                await sleep(1000);
            }

            if (req.query['fail']) {
                throw new Error('Really bad error!');
            }

            logger.emit({
                severityText: 'INFO',
                body: `Successfully fetched ${todos.length} todos`,
                attributes: {
                    traceId,
                    spanId,
                    todoCount: todos.length
                }
            });

            res.json({ todos, user: user.data });
        } catch (e: any) {
            const activeSpan = api.trace.getSpan(api.context.active());
            const traceId = activeSpan?.spanContext().traceId;
            const spanId = activeSpan?.spanContext().spanId;

            logger.emit({
                severityText: 'ERROR',
                body: e.message,
                attributes: {
                    traceId,
                    spanId,
                    error: {
                        type: e.name,
                        message: e.message,
                        stack: e.stack
                    }
                }
            });

            activeSpan?.recordException(e);
            console.error('Really bad error!', {
                spanId: activeSpan?.spanContext().spanId,
                traceId: activeSpan?.spanContext().traceId,
                traceFlag: activeSpan?.spanContext().traceFlags,
            });
            res.sendStatus(500);
        }
    });
});

app.listen(8080, () => {
    logger.emit({
        severityText: 'INFO',
        body: 'Todo service is up and running!',
        attributes: {
            port: 8080
        }
    });
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
