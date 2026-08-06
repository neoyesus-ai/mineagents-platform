export interface HttpObservation {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

export interface MetricGauge {
  name: string;
  help: string;
  value: number;
}

interface HttpMetricBucket {
  method: string;
  route: string;
  statusCode: number;
  count: number;
  durationSeconds: number;
}

export interface HttpMetricsOptions {
  service: string;
  now?: () => number;
}

const metricNamePattern = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

const escapeLabel = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');

const normalizeMethod = (method: string): string => {
  const normalized = method.toUpperCase();
  return ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"].includes(normalized)
    ? normalized
    : "OTHER";
};

export class HttpMetrics {
  private readonly service: string;
  private readonly now: () => number;
  private readonly startedAt: number;
  private readonly buckets = new Map<string, HttpMetricBucket>();

  constructor(options: HttpMetricsOptions) {
    if (options.service.trim().length === 0) {
      throw new TypeError("Metrics service must be a non-empty string.");
    }
    this.service = options.service;
    this.now = options.now ?? (() => performance.now());
    this.startedAt = this.now();
  }

  observe(observation: HttpObservation): void {
    const method = normalizeMethod(observation.method);
    const statusCode =
      Number.isSafeInteger(observation.statusCode) && observation.statusCode >= 100
        ? observation.statusCode
        : 500;
    const durationSeconds =
      Number.isFinite(observation.durationMs) && observation.durationMs >= 0
        ? observation.durationMs / 1_000
        : 0;
    const key = JSON.stringify([method, observation.route, statusCode]);
    const bucket = this.buckets.get(key) ?? {
      method,
      route: observation.route,
      statusCode,
      count: 0,
      durationSeconds: 0,
    };
    bucket.count += 1;
    bucket.durationSeconds += durationSeconds;
    this.buckets.set(key, bucket);
  }

  render(gauges: readonly MetricGauge[] = []): string {
    const lines = [
      "# HELP mineagents_http_requests_total HTTP requests completed by bounded route.",
      "# TYPE mineagents_http_requests_total counter",
      "# HELP mineagents_http_request_duration_seconds HTTP request duration by bounded route.",
      "# TYPE mineagents_http_request_duration_seconds summary",
    ];

    const buckets = [...this.buckets.values()].sort((left, right) =>
      `${left.method}:${left.route}:${left.statusCode}`.localeCompare(
        `${right.method}:${right.route}:${right.statusCode}`,
      ),
    );
    for (const bucket of buckets) {
      const labels = `service="${escapeLabel(this.service)}",method="${bucket.method}",route="${escapeLabel(bucket.route)}",status_code="${bucket.statusCode}"`;
      lines.push(`mineagents_http_requests_total{${labels}} ${bucket.count}`);
      lines.push(
        `mineagents_http_request_duration_seconds_sum{${labels}} ${bucket.durationSeconds}`,
      );
      lines.push(`mineagents_http_request_duration_seconds_count{${labels}} ${bucket.count}`);
    }

    lines.push(
      "# HELP mineagents_process_uptime_seconds Process uptime measured by the metrics registry.",
      "# TYPE mineagents_process_uptime_seconds gauge",
      `mineagents_process_uptime_seconds{service="${escapeLabel(this.service)}"} ${Math.max(0, (this.now() - this.startedAt) / 1_000)}`,
    );

    for (const gauge of gauges) {
      if (!metricNamePattern.test(gauge.name) || !Number.isFinite(gauge.value)) {
        throw new TypeError("Metric gauges require a valid name and finite value.");
      }
      lines.push(
        `# HELP ${gauge.name} ${gauge.help.replaceAll("\n", " ")}`,
        `# TYPE ${gauge.name} gauge`,
        `${gauge.name}{service="${escapeLabel(this.service)}"} ${gauge.value}`,
      );
    }

    return `${lines.join("\n")}\n`;
  }
}
