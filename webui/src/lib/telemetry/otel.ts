/**
 * Browser OpenTelemetry bootstrap for minibot WebUI.
 * Exports traces via OTLP/HTTP to the local collector (infra-observability).
 */

import { SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  WebTracerProvider,
} from "@opentelemetry/sdk-trace-web";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

export { SpanStatusCode, trace };
export type { Tracer };

let provider: WebTracerProvider | null = null;
let initAttempted = false;

function detectMode(): string {
  try {
    return (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE ?? "development";
  } catch {
    return "development";
  }
}

/** OTLP HTTP traces endpoint. Override with VITE_OTEL_EXPORTER_OTLP_ENDPOINT. */
export function resolveOtlpTracesUrl(): string {
  try {
    const env = (import.meta as ImportMeta & {
      env?: { VITE_OTEL_EXPORTER_OTLP_ENDPOINT?: string; MODE?: string };
    }).env;
    if (env?.VITE_OTEL_EXPORTER_OTLP_ENDPOINT) {
      return env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "");
    }
    if (env?.MODE === "test") return "";
  } catch {
    // ignore
  }
  // Vite can proxy /otlp → collector:4318; packaged SPA talks to collector directly.
  if (typeof window !== "undefined") {
    const { port, hostname } = window.location;
    if (port === "5173" || port === "5174") {
      return `${window.location.origin}/otlp/v1/traces`;
    }
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://127.0.0.1:4318/v1/traces";
    }
  }
  return "http://127.0.0.1:4318/v1/traces";
}

export function initWebTelemetry(options?: {
  serviceName?: string;
  serviceVersion?: string;
  otlpUrl?: string;
}): WebTracerProvider | null {
  if (initAttempted) return provider;
  initAttempted = true;

  if (detectMode() === "test") {
    return null;
  }

  const otlpUrl = options?.otlpUrl ?? resolveOtlpTracesUrl();
  if (!otlpUrl) return null;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: options?.serviceName ?? "minibot-webui",
    [ATTR_SERVICE_VERSION]: options?.serviceVersion ?? "0.0.0",
    "deployment.environment": detectMode() === "production" ? "stable" : "dev",
  });

  const exporter = new OTLPTraceExporter({
    url: otlpUrl,
  });

  const next = new WebTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(exporter, {
        scheduledDelayMillis: 500,
        maxExportBatchSize: 32,
      }),
    ],
  });
  next.register();
  provider = next;
  return provider;
}

export function getWebTracer(name = "minibot.web.boot"): Tracer {
  initWebTelemetry();
  return trace.getTracer(name, "1.0.0");
}

export async function forceFlushWebTelemetry(): Promise<void> {
  if (!provider) return;
  try {
    await provider.forceFlush();
  } catch {
    // best-effort
  }
}

/** Test-only reset. */
export function resetWebTelemetryForTests(): void {
  provider = null;
  initAttempted = false;
}
