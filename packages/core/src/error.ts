/**
 * The error a package throws at its boundary, when it rejects data it was
 * handed (`docs/CONVENTIONS.md`, "Errors"). `code` is a stable string a caller
 * can branch on, as io will to pick an HTTP status; the message is for people;
 * `cause` is the error underneath, when there is one.
 */
export class WayfordError extends Error {
  override readonly name = "WayfordError";
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}
