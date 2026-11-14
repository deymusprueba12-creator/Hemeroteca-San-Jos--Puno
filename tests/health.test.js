import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../backend/src/app.js";

test("liveness endpoint responds while the process is running", async () => {
  const app = createApp();
  const response = await request(app).get("/api/v1/health/live");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.service, "hemeroteca-api");
});

test("readiness endpoint responds when PostgreSQL is reachable", async () => {
  const pool = {
    query: async (sql) => {
      assert.equal(sql, "SELECT 1");
      return { rows: [{ "?column?": 1 }] };
    }
  };

  const response = await request(createApp({ pool }))
    .get("/api/v1/health/ready");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.database, "connected");
});

test("readiness endpoint returns 503 when the database is unavailable", async () => {
  const pool = {
    query: async () => {
      throw new Error("database offline");
    }
  };

  const response = await request(createApp({ pool }))
    .get("/api/v1/health/ready");

  assert.equal(response.status, 503);
  assert.equal(response.body.status, "not_ready");
});

test("unknown API routes return a structured 404", async () => {
  const response = await request(createApp()).get("/api/v1/does-not-exist");

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
});
