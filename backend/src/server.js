import { createServer } from "node:http";
import pg from "pg";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const { Pool } = pg;
const config = loadEnv();

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

pool.on("error", (error) => {
  console.error("Unexpected idle PostgreSQL client error:", error);
});

const app = createApp({ pool });
const server = createServer(app);

server.listen(config.PORT, config.HOST, () => {
  console.log(`Hemeroteca API listening on http://${config.HOST}:${config.PORT}`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Received ${signal}; shutting down gracefully...`);

  server.close(async (serverError) => {
    try {
      await pool.end();
      if (serverError) {
        console.error("HTTP server shutdown error:", serverError);
        process.exitCode = 1;
      }
    } catch (databaseError) {
      console.error("PostgreSQL pool shutdown error:", databaseError);
      process.exitCode = 1;
    }
  });

  setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
