import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

interface MongoDuplicate extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

/** 404 for unmatched routes, registered after every router. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, `Cannot ${req.method} ${req.originalUrl}`));
}

/**
 * Single exit point for every error, so clients only ever see `{ message }`.
 * `MessageDialog`-style surfaces read `err.response?.data?.message`, and a few
 * components fall back to `HTTP <status> <statusText>` when no message is
 * present — but returning a real message avoids that degraded path entirely.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let status = 500;
  let message = "Something went wrong.";
  let errors: string[] | undefined;

  if (err instanceof ApiError) {
    status = err.status;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 422;
    errors = Object.values(err.errors).map((e) => e.message);
    message = errors[0] ?? "Validation failed.";
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `"${String(err.value)}" is not a valid ${err.path}.`;
  } else if ((err as MongoDuplicate)?.code === 11000) {
    status = 409;
    const field = Object.keys((err as MongoDuplicate).keyValue ?? {}).join(", ");
    message = field
      ? `That ${field} is already in use.`
      : "That value is already in use.";
  } else if (err instanceof Error) {
    // Body-parser rejects malformed JSON / oversized payloads with a status.
    const anyErr = err as Error & { status?: number; statusCode?: number; type?: string };
    if (anyErr.type === "entity.parse.failed") {
      status = 400;
      message = "Request body is not valid JSON.";
    } else if (anyErr.type === "entity.too.large") {
      status = 413;
      message = "Request body is too large.";
    } else if (anyErr.status === 413 || anyErr.statusCode === 413) {
      status = 413;
      message = "Request body is too large.";
    } else {
      if (!env.isProduction) console.error("[error]", err);
    }
  }

  if (status >= 500 && !env.isProduction) {
    console.error("[500]", err);
  }

  const body: { message: string; errors?: string[] } = { message };
  if (errors?.length) body.errors = errors;
  res.status(status).json(body);
}