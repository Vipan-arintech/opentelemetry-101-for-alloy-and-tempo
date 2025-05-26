import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ParentBasedSampler } from '@opentelemetry/sdk-trace-base'
import { OurSampler } from './ourSampler';
import { W3CBaggagePropagator, W3CTraceContextPropagator, CompositePropagator } from '@opentelemetry/core'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';

function start(serviceName: string) {
    // Create and configure the LoggerProvider
    const loggerProvider = new LoggerProvider({
        resource: new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
            'team.owner': 'core-team',
            'deployment': '4'
        }),
    });

    // Create and configure the OTLP log exporter
    const logExporter = new OTLPLogExporter({
        url: 'http://alloy:4318/v1/logs',
        headers: {
            'Content-Type': 'application/x-protobuf'
        }
    });

    // Add the log processor to the provider
    loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(logExporter));

    const { endpoint, port } = PrometheusExporter.DEFAULT_OPTIONS;
    const meterProvider = new MeterProvider({
        resource: new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
        }),
    }); 
    const metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
            url: 'http://alloy:4318/v1/metrics'
        })
    })
    meterProvider.addMetricReader(metricReader);
    const meter = meterProvider.getMeter('my-service-meter');

    const traceExporter = new OTLPTraceExporter({
        url: 'http://alloy:4318/v1/traces',
    });

    const sdk = new NodeSDK({
        traceExporter,
        serviceName: serviceName,
        instrumentations: [getNodeAutoInstrumentations({
            "@opentelemetry/instrumentation-fs":{
                enabled:false
            },
            "@opentelemetry/instrumentation-http":{
                headersToSpanAttributes:{
                    client:{
                        requestHeaders:['tracestate','traceparent','baggage']
                    },
                    server:{
                        requestHeaders:['tracestate','traceparent','baggage']
                    }
                }
            }
        })],
        autoDetectResources:true,
        resource: new Resource({
            'team.owner':'core-team',
            'deployment':'4'
        }),
        sampler: new ParentBasedSampler({
            root: new OurSampler()
        }),
        textMapPropagator: new CompositePropagator({
            propagators:[new W3CTraceContextPropagator(), new W3CBaggagePropagator()]
        })
    });

    sdk.start();

    return {
        meter,
        logger: loggerProvider.getLogger('todo-service-logger')
    };
}

export default start;