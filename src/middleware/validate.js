import { ZodError } from "zod";
import { appLogger, requestMeta } from "../services/logger.js";

export function validate(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      req.validated = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = (err.errors || []).map((e) => ({
          path: Array.isArray(e.path) ? e.path.join(".") : String(e.path || ""),
          message: e.message,
          code: e.code,
        }));
        appLogger.warn(
          requestMeta(req, {
            method: req.method,
            path: req.originalUrl,
            issues,
          }),
          "validation_failed"
        );
        return res.status(400).json({
          error: "Validation failed",
          details: err.errors,
        });
      }
      next(err);
    }
  };
}

