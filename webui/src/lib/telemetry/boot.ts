/**
 * Web boot telemetry via OpenTelemetry spans.
 * Public API stays stage-oriented; export goes OTLP → Collector → Tempo.
 */

import { SpanStatusCode, type Span, type Tracer } from "@opentelemetry/api";

import {
  STAGE_OK_EVENT,
  type WebBootEvent,
  type WebBootEventName,
  type WebBootSessionOptions,
  type WebBootSessionSummary,
  type WebBootStage,
  type WebBootStatus,
} from "./bootTypes";
import {
  childCtx,
  defaultEmit,
  detectAppVersion,
  detectBuildChannel,
  detectColdStart,
  randomId,
} from "./bootUtils";
import {
  detectClientContext,
  flattenContext,
  lookupGeoBestEffort,
  type ClientContext,
  type GeoContext,
} from "./clientContext";
import { forceFlushWebTelemetry, getWebTracer, initWebTelemetry } from "./otel";

export type {
  WebBootEvent,
  WebBootEventName,
  WebBootSessionOptions,
  WebBootSessionSummary,
  WebBootStage,
  WebBootStatus,
} from "./bootTypes";
export { classifyBootError } from "./bootUtils";

export class WebBootSession {
  readonly bootId: string;
  readonly appVersion: string;
  readonly buildChannel: string;
  readonly coldStart: boolean;
  readonly startedAt: number;

  private readonly now: () => number;
  private readonly emitFn: (payload: WebBootEvent | WebBootSessionSummary) => void;
  private readonly tracer: Tracer | null;
  private readonly rootSpan: Span | null;
  private readonly stageStartedAt = new Map<WebBootStage, number>();
  private readonly stageSpans = new Map<WebBootStage, Span>();
  private readonly stageDurations: Partial<Record<WebBootStage, number>> = {};
  private finished = false;
  private firstErrorStage: WebBootStage | null = null;
  private traceId: string | null = null;
  private readonly clientContext: ClientContext | null;
  private readonly geoPromise: Promise<GeoContext>;
  private geoContext: GeoContext = { "geo.source": "pending" };

  constructor(options: WebBootSessionOptions = {}) {
    this.bootId = randomId();
    this.appVersion = options.appVersion ?? detectAppVersion();
    this.buildChannel = options.buildChannel ?? detectBuildChannel();
    this.coldStart = options.coldStart ?? detectColdStart();
    this.now = options.now ?? (() =>
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now());
    this.emitFn = options.emit ?? defaultEmit;
    this.startedAt = this.now();

    this.clientContext =
      options.clientContext === null
        ? null
        : (options.clientContext ?? detectClientContext());

    if (options.geoLookup === null) {
      this.geoContext = { "geo.source": "disabled" };
      this.geoPromise = Promise.resolve(this.geoContext);
    } else if (options.geoLookup) {
      this.geoPromise = options.geoLookup();
    } else {
      this.geoPromise = lookupGeoBestEffort();
    }
    void this.geoPromise.then((geo) => {
      this.geoContext = geo;
      if (this.rootSpan && !this.finished) {
        for (const [k, v] of Object.entries(flattenContext(geo))) {
          this.rootSpan.setAttribute(k, v);
        }
      }
    });

    const enableOtel = options.enableOtel ?? true;
    if (enableOtel && options.tracer === undefined) {
      const provider = initWebTelemetry({ serviceVersion: this.appVersion });
      this.tracer = provider ? getWebTracer() : null;
    } else {
      this.tracer = options.tracer ?? null;
    }

    const clientAttrs = this.clientContext ? flattenContext(this.clientContext) : {};
    this.rootSpan = this.tracer
      ? this.tracer.startSpan("web.boot", {
          attributes: {
            "boot.id": this.bootId,
            "boot.platform": "web",
            "boot.channel": this.buildChannel,
            "boot.cold_start": this.coldStart,
            "service.version": this.appVersion,
            ...clientAttrs,
          },
        })
      : null;
    if (this.rootSpan) {
      this.traceId = this.rootSpan.spanContext().traceId || null;
    }

    this.stageStartedAt.set("js_boot", this.startedAt);
    this.begin("js_boot");
    this.markOk("js_boot");
  }

  /** Mark the start of a stage. */
  begin(stage: WebBootStage): void {
    if (this.finished) return;
    this.stageStartedAt.set(stage, this.now());
    if (!this.tracer || !this.rootSpan) return;
    if (this.stageSpans.has(stage)) return;
    const span = this.tracer.startSpan(
      `web.boot.${stage}`,
      {
        attributes: {
          "boot.id": this.bootId,
          "boot.stage": stage,
        },
      },
      childCtx(this.rootSpan),
    );
    this.stageSpans.set(stage, span);
  }

  markOk(stage: WebBootStage, extra?: Record<string, unknown>): void {
    if (this.finished) return;
    const duration = this.durationFor(stage);
    this.stageDurations[stage] = duration;
    this.endStageSpan(stage, true, null, null, extra);
    this.emitEvent(STAGE_OK_EVENT[stage], stage, "ok", null, null, duration, extra);
  }

  markFail(
    stage: WebBootStage,
    errorCode: string,
    errorMessage?: string,
    extra?: Record<string, unknown>,
  ): void {
    if (this.finished) return;
    const duration = this.durationFor(stage);
    this.stageDurations[stage] = duration;
    if (!this.firstErrorStage) this.firstErrorStage = stage;
    this.endStageSpan(stage, false, errorCode, errorMessage ?? null, extra);
    const failEvent: WebBootEventName =
      stage === "auth_config"
        ? "web_auth_config_fail"
        : stage === "bootstrap"
          ? "web_bootstrap_fail"
          : STAGE_OK_EVENT[stage];
    this.emitEvent(failEvent, stage, "fail", errorCode, errorMessage ?? null, duration, extra);
    this.finish(false, errorCode, errorMessage ?? null);
  }

  markFirstPaint(): void {
    this.markOk("first_paint");
  }

  markFirstInteractive(): void {
    if (this.finished) return;
    this.markOk("first_interactive");
    this.finish(true);
  }

  getStageDurations(): Partial<Record<WebBootStage, number>> {
    return { ...this.stageDurations };
  }

  getTraceId(): string | null {
    return this.traceId;
  }

  isFinished(): boolean {
    return this.finished;
  }

  private durationFor(stage: WebBootStage): number {
    const start = this.stageStartedAt.get(stage) ?? this.startedAt;
    return Math.max(0, Math.round(this.now() - start));
  }

  private endStageSpan(
    stage: WebBootStage,
    ok: boolean,
    errorCode: string | null,
    errorMessage: string | null,
    extra?: Record<string, unknown>,
  ): void {
    let span = this.stageSpans.get(stage);
    if (!span && this.tracer && this.rootSpan) {
      // begin() skipped — create a short span for the stage.
      span = this.tracer.startSpan(
        `web.boot.${stage}`,
        {
          attributes: {
            "boot.id": this.bootId,
            "boot.stage": stage,
          },
        },
        childCtx(this.rootSpan),
      );
      this.stageSpans.set(stage, span);
    }
    if (!span) return;
    span.setAttribute("boot.duration_ms", this.stageDurations[stage] ?? 0);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        if (v == null) continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          span.setAttribute(`boot.extra.${k}`, v);
        }
      }
    }
    if (ok) {
      span.setStatus({ code: SpanStatusCode.OK });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage ?? errorCode ?? "error",
      });
      if (errorCode) span.setAttribute("boot.error_code", errorCode);
      if (errorMessage) span.setAttribute("boot.error_message", errorMessage);
    }
    span.end();
    this.stageSpans.delete(stage);
  }

  private emitEvent(
    event: WebBootEventName,
    stage: WebBootStage,
    status: WebBootStatus,
    errorCode: string | null,
    errorMessage: string | null,
    durationMs: number | null,
    extra?: Record<string, unknown>,
  ): void {
    const payload: WebBootEvent = {
      event,
      boot_id: this.bootId,
      trace_id: this.traceId,
      ts: new Date().toISOString(),
      stage,
      duration_ms: durationMs,
      status,
      app_version: this.appVersion,
      platform: "web",
      build_channel: this.buildChannel,
      cold_start: this.coldStart,
      error_code: errorCode,
      error_message: errorMessage,
      extra,
    };
    this.emitFn(payload);
  }

  private finish(ok: boolean, errorCode?: string | null, errorMessage?: string | null): void {
    if (this.finished) return;
    this.finished = true;
    const totalMs = Math.max(0, Math.round(this.now() - this.startedAt));
    // Sync path when geo already resolved/disabled (tests + fast local).
    if (this.geoContext["geo.source"] !== "pending") {
      this.completeFinish(ok, totalMs, errorCode ?? null, errorMessage ?? null);
      return;
    }
    void this.finishAsync(ok, totalMs, errorCode ?? null, errorMessage ?? null);
  }

  private async finishAsync(
    ok: boolean,
    totalMs: number,
    errorCode: string | null,
    errorMessage: string | null,
  ): Promise<void> {
    try {
      this.geoContext = await Promise.race([
        this.geoPromise,
        new Promise<GeoContext>((resolve) =>
          setTimeout(() => resolve(this.geoContext), 850),
        ),
      ]);
    } catch {
      // keep pending/partial
    }
    this.completeFinish(ok, totalMs, errorCode, errorMessage);
  }

  private completeFinish(
    ok: boolean,
    totalMs: number,
    errorCode: string | null,
    errorMessage: string | null,
  ): void {
    if (this.rootSpan) {
      this.rootSpan.setAttribute("boot.total_ms", totalMs);
      this.rootSpan.setAttribute("boot.status", ok ? "ok" : "fail");
      for (const [stage, ms] of Object.entries(this.stageDurations)) {
        this.rootSpan.setAttribute(`boot.stage.${stage}_ms`, ms as number);
      }
      for (const [k, v] of Object.entries(flattenContext(this.geoContext))) {
        this.rootSpan.setAttribute(k, v);
      }
      if (ok) {
        this.rootSpan.setStatus({ code: SpanStatusCode.OK });
      } else {
        this.rootSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage ?? errorCode ?? "boot_failed",
        });
        if (errorCode) this.rootSpan.setAttribute("boot.error_code", errorCode);
        if (this.firstErrorStage) {
          this.rootSpan.setAttribute("boot.first_error_stage", this.firstErrorStage);
        }
      }
      this.rootSpan.end();
      void forceFlushWebTelemetry();
    }

    const summary: WebBootSessionSummary = {
      event: ok ? "web_boot_complete" : "web_boot_failed",
      boot_id: this.bootId,
      trace_id: this.traceId,
      ts: new Date().toISOString(),
      status: ok ? "ok" : "fail",
      app_version: this.appVersion,
      platform: "web",
      build_channel: this.buildChannel,
      cold_start: this.coldStart,
      total_ms: totalMs,
      stage_durations: { ...this.stageDurations },
      error_code: errorCode,
      error_message: errorMessage,
      first_error_stage: this.firstErrorStage,
      client_context: flattenContext(this.clientContext ?? {}, this.geoContext),
    };
    this.emitFn(summary);
  }
}

export function createWebBootSession(options?: WebBootSessionOptions): WebBootSession {
  return new WebBootSession(options);
}
