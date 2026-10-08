import "server-only";

const SECRET_KEY = /secret|password|token|authorization|cookie|credential|database_url|api[_-]?key/i;
const POSTGRES_URL = /postgres(?:ql)?:\/\/[^\s'"]+/gi;
const GITHUB_TOKEN = /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]+\b/g;
const PROVIDER_KEY = /\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{10,})\b/g;
const SENSITIVE_PARAM = /(client_secret|access_token|refresh_token)=([^&\s]+)/gi;

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function redactString(value: string): string {
  return value
    .replace(GITHUB_TOKEN, "[redacted]")
    .replace(PROVIDER_KEY, "[redacted]")
    .replace(SENSITIVE_PARAM, "$1=[redacted]")
    .replace(POSTGRES_URL, "postgresql://[redacted]");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SECRET_KEY.test(key) ? "[redacted]" : redact(entry, depth + 1);
    }
    return output;
  }
  return String(value);
}

export function readLogLevel(value: string | undefined): LogLevel {
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  return "info";
}

function write(level: LogLevel, message: string, fields?: Record<string, unknown>) {
  const current = readLogLevel(process.env.LOG_LEVEL);
  if (ORDER[level] < ORDER[current]) return;

  const payload = {
    time: new Date().toISOString(),
    level,
    message: redactString(message),
    service: "ai-project-optimizer",
    ...(fields ? { fields: redact(fields) } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  debug(message: string, fields?: Record<string, unknown>) {
    write("debug", message, fields);
  },
  info(message: string, fields?: Record<string, unknown>) {
    write("info", message, fields);
  },
  warn(message: string, fields?: Record<string, unknown>) {
    write("warn", message, fields);
  },
  error(message: string, fields?: Record<string, unknown>) {
    write("error", message, fields);
  },
};
