/**
 * Every failure that reaches the client goes through ApiError so the frontend
 * always receives `{ message }` — the shape ~25 call sites read via
 * `err.response?.data?.message`. A handful also read `errors: string[]`.
 */
export class ApiError extends Error {
  status: number;
  errors?: string[];
  code?: string;

  constructor(status: number, message: string, options?: { errors?: string[]; code?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (options?.errors) this.errors = options.errors;
    if (options?.code) this.code = options.code;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message: string, errors?: string[]): ApiError {
    return new ApiError(400, message, { errors });
  }

  static unauthorized(message = "Authentication required."): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = "You do not have access to this resource."): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = "Resource not found."): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message);
  }

  /** Mongoose duplicate key (e.g. duplicate email / employeeCode). */
  static duplicate(message: string): ApiError {
    return new ApiError(409, message);
  }

  static unprocessable(message: string, errors?: string[]): ApiError {
    return new ApiError(422, message, { errors });
  }
  /** Rate limiting (P2). Deliberately generic, so throttling reads like any other auth refusal. */
  static tooManyRequests(message = "Too many requests. Please try again later."): ApiError {
    return new ApiError(429, message);
  }

  static internal(message = "Something went wrong."): ApiError {
    return new ApiError(500, message);
  }
}