// An error we throw on purpose. The central error handler turns it into a JSON response
// with the given HTTP status code and a message that is safe to show to the user.

export class AppError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
  }
}
