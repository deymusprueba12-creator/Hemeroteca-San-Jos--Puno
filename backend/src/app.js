import express from "express";
import helmet from "helmet";

export function createApp({ pool } = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/v1/health/live", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "hemeroteca-api"
    });
  });

  app.get("/api/v1/health/ready", async (_req, res) => {
    if (!pool) {
      return res.status(503).json({
        status: "not_ready",
        reason: "database_pool_unavailable"
      });
    }

    try {
      await pool.query("SELECT 1");
      return res.status(200).json({
        status: "ready",
        database: "connected"
      });
    } catch {
      return res.status(503).json({
        status: "not_ready",
        database: "unavailable"
      });
    }
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "API route not found"
      }
    });
  });

  app.use((err, _req, res, _next) => {
    // Do not expose stack traces or internal error details to clients.
    console.error("Unhandled request error:", err);
    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred"
      }
    });
  });

  return app;
}
