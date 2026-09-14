import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import UserServiceClient from "../src/clients/UserServiceClient";
import { AuthenticationError } from "../src/errors/AuthenticationError";
import { DependencyUnavailableError } from "../src/errors/DependencyUnavailableError";
import withServer from "./testServer";

test("REST client calls profile with only the provided Bearer credential", async () => {
  const app = express();
  let calls = 0;
  app.get("/api/profile", (request, response) => {
    calls++;
    assert.equal(request.get("authorization"), "Bearer test-token");
    assert.equal(request.get("cookie"), undefined);
    response.json({ user: { id: 12, email: "test@example.test", role: "member" } });
  });
  await withServer(app, async base => {
    assert.deepEqual({ ...await new UserServiceClient(base).getCurrentUser("test-token") }, { id: 12 });
  });
  assert.equal(calls, 1);
});

test("401 means invalid credentials; other upstream errors mean unavailable", async () => {
  for (const status of [401, 403, 404, 429, 500, 503]) {
    const app = express();
    app.get("/api/profile", (_request, response) => { response.status(status).json({ message: "private upstream details" }); });
    await withServer(app, async base => {
      await assert.rejects(new UserServiceClient(base).getCurrentUser("test-token"), error => {
        assert.ok(status === 401 ? error instanceof AuthenticationError : error instanceof DependencyUnavailableError);
        assert.equal((error as Error).message.includes("private"), false);
        return true;
      });
    });
  }
});

test("invalid profile responses never authenticate a user", async () => {
  for (const body of [null, {}, { user: {} }, { user: { id: "1" } }, { user: { id: 0 } },
    { user: { id: -1 } }, { user: { id: 1.5 } }, { user: { id: 2147483648 } }]) {
    const app = express();
    app.get("/api/profile", (_request, response) => { response.json(body); });
    await withServer(app, async base => {
      await assert.rejects(new UserServiceClient(base).getCurrentUser("test-token"), DependencyUnavailableError);
    });
  }
});

test("bad JSON, oversized responses and wrong content types fail closed", async () => {
  for (const [body, contentType] of [["{", "application/json"], ["x".repeat(17000), "application/json"], ['{"user":{"id":1}}', "text/html"]]) {
    const app = express();
    app.get("/api/profile", (_request, response) => { response.type(contentType!).send(body); });
    await withServer(app, async base => {
      await assert.rejects(new UserServiceClient(base).getCurrentUser("test-token"), DependencyUnavailableError);
    });
  }
});

test("redirects are rejected without forwarding credentials", async () => {
  const app = express();
  let forwarded = false;
  app.get("/api/profile", (_request, response) => { response.redirect("/unexpected"); });
  app.get("/unexpected", (_request, response) => { forwarded = true; response.json({ user: { id: 1 } }); });
  await withServer(app, async base => {
    await assert.rejects(new UserServiceClient(base).getCurrentUser("test-token"), DependencyUnavailableError);
  });
  assert.equal(forwarded, false);
});

test("slow responses time out without retries", async () => {
  const app = express();
  let calls = 0;
  app.get("/api/profile", (_request, response) => {
    calls++;
    const timer = setTimeout(() => response.json({ user: { id: 1 } }), 500);
    response.on("close", () => clearTimeout(timer));
  });
  await withServer(app, async base => {
    const start = Date.now();
    await assert.rejects(new UserServiceClient(base, 40).getCurrentUser("test-token"), DependencyUnavailableError);
    assert.ok(Date.now() - start < 1000);
  });
  assert.equal(calls, 1);
});

test("a body that stalls after headers also times out", async () => {
  const app = express();
  app.get("/api/profile", (_request, response) => {
    response.type("json").write('{"user":');
  });
  await withServer(app, async base => {
    await assert.rejects(new UserServiceClient(base, 40).getCurrentUser("test-token"), DependencyUnavailableError);
  });
});

test("connection failures become dependency errors", async () => {
  const app = express();
  let closedUrl = "";
  await withServer(app, async base => { closedUrl = base; });
  await assert.rejects(new UserServiceClient(closedUrl, 100).getCurrentUser("test-token"), DependencyUnavailableError);
});
