export type LogFields = Readonly<Record<string, unknown>>;

export interface StructuredLogger {
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export interface JsonLoggerOptions {
  service: string;
  write?: (line: string) => void;
  now?: () => Date;
}

const safeJson = (value: unknown): string =>
  JSON.stringify(value, (_key, field: unknown) => {
    if (typeof field === "bigint") {
      return field.toString();
    }
    if (field instanceof Error) {
      return { name: field.name, message: field.message };
    }
    return field;
  });

export const createJsonLogger = (options: JsonLoggerOptions): StructuredLogger => {
  if (options.service.trim().length === 0) {
    throw new TypeError("Logger service must be a non-empty string.");
  }
  const write = options.write ?? ((line: string) => console.log(line));
  const now = options.now ?? (() => new Date());

  const log = (level: "info" | "error", event: string, fields: LogFields = {}): void => {
    write(
      safeJson({
        ...fields,
        timestamp: now().toISOString(),
        level,
        service: options.service,
        event,
      }),
    );
  };

  return {
    info: (event, fields) => log("info", event, fields),
    error: (event, fields) => log("error", event, fields),
  };
};

export const noopLogger: StructuredLogger = {
  info: () => undefined,
  error: () => undefined,
};
