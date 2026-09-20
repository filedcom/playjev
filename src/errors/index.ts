/** Base class for errors raised by PlayJev. */
export class PlayJevError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A Jev API request failed after the configured retry policy. */
export class JevRequestError extends PlayJevError {
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}
