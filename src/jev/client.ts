import type { JevQuestion, JevResult } from "../types/index.js";
import { JevRequestError } from "../errors/index.js";

export interface JevClientOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class JevClient {
  readonly model: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly #apiKey: string;

  constructor(options: JevClientOptions) {
    if (!options.apiKey) throw new Error("TYPESAFE_API_KEY is required");
    this.#apiKey = options.apiKey;
    this.model = options.model ?? "jev-latest";
    this.baseUrl = (options.baseUrl ?? "https://api.typesafe.ai/v1").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    if (this.timeoutMs <= 0) throw new Error("requestTimeoutMs must be greater than zero");
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) {
      throw new Error("maxRetries must be a non-negative integer");
    }
  }

  async evaluate(state: unknown, questions: Record<string, JevQuestion>): Promise<JevResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}/systemone`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.#apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ state, model: this.model, questions }),
          signal: controller.signal,
        });
        if (response.ok) {
          const result: unknown = await response.json();
          if (!isJevResult(result)) throw new JevRequestError("Jev returned an invalid response");
          return result;
        }

        const detail = (await response.text()).slice(0, 1_000);
        const error = new JevRequestError(
          `Jev request failed (${response.status})${detail ? `: ${detail}` : ""}`,
          response.status,
        );
        if (!isTransientStatus(response.status) || attempt === this.maxRetries) throw error;
        lastError = error;
        await delay(retryDelay(response.headers.get("retry-after"), attempt));
      } catch (error) {
        lastError = error;
        if (error instanceof JevRequestError && !isTransientStatus(error.status)) throw error;
        if (attempt === this.maxRetries) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new JevRequestError(
            `Jev request failed after ${attempt + 1} attempts: ${reason}`,
            undefined,
            {
              cause: error,
            },
          );
        }
        await delay(retryDelay(null, attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new JevRequestError("Jev request failed", undefined, { cause: lastError });
  }
}

function isJevResult(value: unknown): value is JevResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.model === "string" && !!record.answers && typeof record.answers === "object";
}

function isTransientStatus(status: number | undefined): boolean {
  return status === 408 || status === 429 || (status !== undefined && status >= 500);
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 10_000);
  return Math.min(250 * 2 ** attempt, 2_000);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
