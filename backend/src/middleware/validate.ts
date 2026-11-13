import type { NextFunction, Request, RequestHandler, Response } from "express";
import { validationResult, type ValidationChain } from "express-validator";
import { ApiError } from "../utils/ApiError.js";

/**
 * Runs the express-validator chains, then mirrors the resulting error bag into
 * the `{ message, errors[] }` shape the frontend reads. `My-employee.tsx` joins
 * `data.errors` with spaces, which is how multi-field validation failures
 * reach the UI.
 *
 * Returns an ARRAY of handlers because Express only executes a validation chain
 * when it is invoked as middleware — collecting `validationResult(req)` without
 * first running the chains silently reports "no errors" for everything.
 */
export function validate(chains: ValidationChain[]): RequestHandler[] {
  const check: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();

    const errors = result.array({ onlyFirstError: true }).map((e) => e.msg);
    return next(ApiError.unprocessable(errors[0] ?? "Validation failed.", errors));
  };

  return [...chains, check];
}