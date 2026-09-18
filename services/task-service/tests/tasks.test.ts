import assert from "node:assert/strict";
import test from "node:test";
import createApp from "../src/app";
import { TaskController } from "../src/controllers/TaskController";
import { AuthenticationError } from "../src/errors/AuthenticationError";
import { DependencyUnavailableError } from "../src/errors/DependencyUnavailableError";
import type { ITaskRepository } from "../src/interfaces/repositories/ITaskRepository";
import type { IUserServiceClient } from "../src/interfaces/services/IUserServiceClient";
import { Task } from "../src/models/domain/Task";
import { CreateTaskRequestDto } from "../src/models/dto/requests/CreateTaskRequestDto";
import { TaskResponseMapper } from "../src/mappers/TaskResponseMapper";
import { TaskService } from "../src/services/TaskService";
import { RequestValidator } from "../src/utils/RequestValidator";
import withServer from "./testServer";

function fixture(users?: IUserServiceClient) {
  const rows: Task[] = [];
  let nextId = 1;
  const logs: unknown[][] = [];
  const repository: ITaskRepository = {
    async create(input) {
      const task = new Task({ ...input, id: nextId++, status: "pending", createdAt: new Date() });
      rows.push(task);
      return task;
    },
    async listByOwner(owner, after, limit) {
      return rows.filter(row => row.ownerUserId === owner && row.id > after).slice(0, limit);
    },
    async updateByOwner(id, owner, input) {
      const index = rows.findIndex(row => row.id === id && row.ownerUserId === owner);
      const row = rows[index];
      if (!row) return null;
      const updated = new Task({
        ...row, title: input.title ?? row.title, description: input.description ?? row.description,
        status: input.status ?? row.status,
      });
      rows[index] = updated;
      return updated;
    },
    async deleteByOwner(id, owner) {
      const index = rows.findIndex(row => row.id === id && row.ownerUserId === owner);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
  };
  const app = createApp({
    tasks: new TaskService(repository), checkDatabase: async () => undefined,
    users: users ?? { async getCurrentUser(token) {
      if (!["alice", "bob"].includes(token)) throw new AuthenticationError("Invalid or expired credentials.");
      return { id: token === "alice" ? 1 : 2 };
    } },
  }, { error: (...args: unknown[]) => { logs.push(args); } });
  return { rows, logs, app, repository };
}

function post(base: string, body: unknown, token = "alice") {
  return fetch(base + "/api/tasks", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("create uses normalized DTO fields and the authenticated owner", async () => {
  const { app, rows } = fixture();
  await withServer(app, async base => {
    const response = await post(base, { title: "  First task  ", description: "  Details  " });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const { task } = await response.json();
    assert.deepEqual(Object.keys(task).sort(), ["createdAt", "description", "id", "ownerUserId", "status", "title"]);
    assert.equal(task.title, "First task");
    assert.equal(task.description, "Details");
    assert.equal(task.ownerUserId, 1);
    assert.equal(task.status, "pending");
    assert.equal(rows.length, 1);
  });
});

test("description is optional and defaults to empty text", async () => {
  const { app } = fixture();
  await withServer(app, async base => {
    const response = await post(base, { title: "Task" });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).task.description, "");
  });
});

test("invalid bodies and ownership overrides never reach the repository", async () => {
  const { app, rows } = fixture();
  const bodies = [null, [], {}, { title: " " }, { title: 1 }, { title: { x: 1 } },
    { title: "x".repeat(201) }, { title: "a\u0000b" }, { title: "a\nb" },
    { title: "Task", description: null }, { title: "Task", description: [] },
    { title: "Task", description: "x".repeat(2001) }, { title: "Task", description: "\u0000" },
    { title: "Task", ownerUserId: 2 }, { title: "Task", assignedToUserId: 2 },
    { title: "Task", status: "completed" }, { title: "Task", id: 99 },
    JSON.parse('{"title":"Task","__proto__":{"ownerUserId":2}}'),
    { title: "Task", constructor: "bad" }];
  await withServer(app, async base => {
    for (const body of bodies) assert.equal((await post(base, body)).status, 400, JSON.stringify(body));
  });
  assert.equal(rows.length, 0);
});

test("DTO limits accept Unicode boundaries without string coercion", async () => {
  const dto = await RequestValidator.validate(CreateTaskRequestDto, { title: "😀".repeat(200), description: "a".repeat(2000) });
  assert.ok(dto instanceof CreateTaskRequestDto);
  assert.equal(dto.title, "😀".repeat(200));
  await assert.rejects(RequestValidator.validate(CreateTaskRequestDto, { title: true }));
});

test("missing, malformed, oversized and rejected tokens cannot write tasks", async () => {
  const { app, rows } = fixture();
  await withServer(app, async base => {
    for (const authorization of ["", "Basic abc", "Bearer", "Bearer a b", "Bearer " + "a".repeat(4097), "Bearer invalid"]) {
      const response = await fetch(base + "/api/tasks", {
        method: "POST", headers: { authorization, "Content-Type": "application/json" }, body: '{"title":"Task"}',
      });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
    }
  });
  assert.equal(rows.length, 0);
});

test("list is owner-scoped and cursor pages do not repeat tasks", async () => {
  const { app } = fixture();
  await withServer(app, async base => {
    await post(base, { title: "Alice 1" });
    await post(base, { title: "Bob 1" }, "bob");
    await post(base, { title: "Alice 2" });
    const get = async (query: string, token = "alice") => {
      const response = await fetch(base + "/api/tasks" + query, { headers: { Authorization: "Bearer " + token } });
      assert.equal(response.status, 200);
      return response.json();
    };
    const first = await get("?limit=1");
    assert.deepEqual(first.tasks.map((task: Task) => task.title), ["Alice 1"]);
    assert.equal(first.nextCursor, 1);
    const second = await get("?limit=1&after=" + first.nextCursor);
    assert.deepEqual(second.tasks.map((task: Task) => task.title), ["Alice 2"]);
    assert.equal(second.nextCursor, null);
    assert.deepEqual((await get("", "bob")).tasks.map((task: Task) => task.title), ["Bob 1"]);
    assert.deepEqual(await get("?after=2147483647"), { tasks: [], nextCursor: null });
  });
});

test("invalid pagination and owner filters are rejected", async () => {
  const { app } = fixture();
  await withServer(app, async base => {
    for (const query of ["limit=0", "limit=101", "limit=1.5", "limit=abc", "limit=1&limit=2",
      "after=-1", "after=2147483648", "after=1e2", "after=", "ownerUserId=2", "after[x]=1"]) {
      const response = await fetch(base + "/api/tasks?" + query, { headers: { Authorization: "Bearer alice" } });
      assert.equal(response.status, 400, query);
    }
  });
});

test("dependency outages fail closed with 503 and no task writes", async () => {
  const { app, rows } = fixture({ async getCurrentUser() {
    throw new DependencyUnavailableError("User Service is unavailable. Please try again later.");
  } });
  await withServer(app, async base => {
    assert.equal((await post(base, { title: "Task" })).status, 503);
    assert.equal((await fetch(base + "/api/health")).status, 200);
  });
  assert.equal(rows.length, 0);
});

test("storage failures do not expose SQL, passwords or tokens", async () => {
  const { app, logs, repository } = fixture();
  repository.create = async () => { throw new Error("password=private SELECT * FROM tasks Bearer alice"); };
  await withServer(app, async base => {
    const response = await post(base, { title: "Task" });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: "Internal server error." });
  });
  assert.equal(/private|SELECT|alice/.test(JSON.stringify(logs)), false);
});

test("malformed and oversized JSON receive safe errors", async () => {
  const { app } = fixture();
  await withServer(app, async base => {
    for (const [body, expected] of [["{", 400], [JSON.stringify({ title: "x".repeat(21000) }), 413]] as const) {
      const response = await fetch(base + "/api/tasks", {
        method: "POST", headers: { Authorization: "Bearer alice", "Content-Type": "application/json" }, body,
      });
      assert.equal(response.status, expected);
    }
  });
});

test("task rate limit does not block health checks", async () => {
  const { app } = fixture();
  await withServer(app, async base => {
    for (let index = 0; index < 120; index++) {
      assert.equal((await fetch(base + "/api/tasks", { headers: { Authorization: "Bearer alice" } })).status, 200);
    }
    assert.equal((await fetch(base + "/api/tasks")).status, 429);
    assert.equal((await fetch(base + "/api/health")).status, 200);
  });
});

test("health reports its database failure without leaking details", async () => {
  const app = createApp({
    tasks: new TaskService(fixture().repository), users: { async getCurrentUser() { return { id: 1 }; } },
    checkDatabase: async () => { throw new Error("private connection string"); },
  });
  await withServer(app, async base => {
    const response = await fetch(base + "/api/health");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).dependencies.database, "down");
  });
});

test("controllers use normal methods and response mapping excludes extra fields", () => {
  const controller = new TaskController(new TaskService(fixture().repository));
  assert.equal(Object.hasOwn(controller, "create"), false);
  assert.equal(Object.hasOwn(controller, "list"), false);
  const task = Object.assign(new Task({
    id: 1, title: "Task", description: "", status: "pending", ownerUserId: 1, createdAt: new Date(),
  }), { passwordHash: "private" });
  assert.equal("passwordHash" in TaskResponseMapper.toResponse(task), false);
});

test("service rejects unbounded pagination even when called without a controller", async () => {
  const service = new TaskService(fixture().repository);
  for (const limit of ["0", "101", "NaN", "1.5"]) {
    await assert.rejects(service.list(1, { limit }));
  }
});

function change(base: string, id: string | number, method: "PATCH" | "DELETE", body?: unknown, token = "alice") {
  return fetch(base + "/api/tasks/" + String(id), {
    method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("partial updates preserve omitted fields, identity and creation time", async () => {
  const { app, rows } = fixture();
  await withServer(app, async base => {
    const original = (await (await post(base, { title: "Original", description: "Keep this" })).json()).task;
    const response = await change(base, original.id, "PATCH", { title: "  Edited  " });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual((await response.json()).task, { ...original, title: "Edited" });
    assert.equal(rows[0]?.description, "Keep this");
  });
});

test("status changes and clearing a description are supported", async () => {
  const { app } = fixture();
  await withServer(app, async base => {
    await post(base, { title: "Task", description: "Remove me" });
    for (const status of ["in_progress", "completed", "pending"]) {
      const response = await change(base, 1, "PATCH", { status });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).task.status, status);
    }
    const response = await change(base, 1, "PATCH", { title: "Renamed", description: "  ", status: "completed" });
    assert.equal(response.status, 200);
    const { task } = await response.json();
    assert.equal(task.title, "Renamed");
    assert.equal(task.description, "");
    assert.equal(task.status, "completed");
  });
});

test("empty, invalid and extra patch fields are rejected without changing data", async () => {
  const { app, rows } = fixture();
  await withServer(app, async base => {
    await post(base, { title: "Original", description: "Keep" });
    const before = JSON.stringify(rows);
    for (const body of [{}, null, [], { title: null }, { title: " " }, { title: [] }, { title: { a: 1 } },
      { title: "x".repeat(201) }, { title: "bad\nvalue" }, { description: null }, { description: 12 },
      { description: "x".repeat(2001) }, { description: "\u0000" }, { status: null }, { status: "archived" },
      { status: "Completed" }, { status: 1 }, { status: ["completed"] }, { ownerUserId: 2 },
      { title: "Changed", id: 2 }, { createdAt: "2026-01-01" }, { assignedToUserId: 2 },
      { constructor: "bad", title: "Changed" }, JSON.parse('{"title":"Changed","__proto__":{"ownerUserId":2}}')]) {
      assert.equal((await change(base, 1, "PATCH", body)).status, 400, JSON.stringify(body));
    }
    assert.equal(JSON.stringify(rows), before);
  });
});

test("invalid task IDs are rejected for both mutations", async () => {
  const { app, rows } = fixture();
  await withServer(app, async base => {
    await post(base, { title: "Task" });
    for (const id of ["0", "-1", "01", "1.5", "1e0", "abc", "2147483648", "99999999999", "1%20OR%201=1"]) {
      assert.equal((await change(base, id, "PATCH", { title: "Changed" })).status, 400, id);
      assert.equal((await change(base, id, "DELETE")).status, 400, id);
    }
    assert.equal(rows[0]?.title, "Task");
  });
});

test("foreign and missing tasks produce identical 404 responses without mutations", async () => {
  const { app, rows } = fixture();
  await withServer(app, async base => {
    await post(base, { title: "Bob task" }, "bob");
    const before = JSON.stringify(rows);
    for (const method of ["PATCH", "DELETE"] as const) {
      for (const id of [1, 999]) {
        const response = await change(base, id, method, method === "PATCH" ? { title: "Unauthorized" } : undefined);
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { message: "Task not found." });
      }
    }
    assert.equal(JSON.stringify(rows), before);
  });
});

test("owner deletion returns 204, removes only that task and repeats as 404", async () => {
  const { app, rows } = fixture();
  await withServer(app, async base => {
    await post(base, { title: "Alice task" });
    await post(base, { title: "Bob task" }, "bob");
    const response = await change(base, 1, "DELETE");
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(rows.map(row => row.title), ["Bob task"]);
    assert.equal((await change(base, 1, "DELETE")).status, 404);
    assert.equal((await change(base, 1, "PATCH", { status: "completed" })).status, 404);
  });
});

test("mutations require authentication even when the task ID is known", async () => {
  const { app, rows } = fixture();
  await withServer(app, async base => {
    await post(base, { title: "Task" });
    for (const method of ["PATCH", "DELETE"] as const) {
      const missing = await fetch(base + "/api/tasks/1", { method });
      assert.equal(missing.status, 401);
      assert.equal((await change(base, 1, method, method === "PATCH" ? { title: "Changed" } : undefined, "invalid")).status, 401);
    }
    assert.equal(rows[0]?.title, "Task");
  });
});

test("User Service failure prevents editing and deletion", async () => {
  let available = true;
  const { app, rows } = fixture({ async getCurrentUser() {
    if (!available) throw new DependencyUnavailableError("User Service is unavailable. Please try again later.");
    return { id: 1 };
  } });
  await withServer(app, async base => {
    await post(base, { title: "Keep" });
    available = false;
    assert.equal((await change(base, 1, "PATCH", { title: "Changed" })).status, 503);
    assert.equal((await change(base, 1, "DELETE")).status, 503);
    assert.equal(rows[0]?.title, "Keep");
  });
});

test("mutation storage errors do not leak sensitive details", async () => {
  const { app, repository, logs } = fixture();
  repository.updateByOwner = async () => { throw new Error("private UPDATE password=secret"); };
  repository.deleteByOwner = async () => { throw new Error("private DELETE password=secret"); };
  await withServer(app, async base => {
    for (const method of ["PATCH", "DELETE"] as const) {
      const response = await change(base, 1, method, method === "PATCH" ? { title: "Changed" } : undefined);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { message: "Internal server error." });
    }
  });
  assert.equal(/private|password|secret|UPDATE|DELETE/.test(JSON.stringify(logs)), false);
});

test("new controller handlers are normal methods and service rejects invalid IDs", async () => {
  const service = new TaskService(fixture().repository);
  const controller = new TaskController(service);
  assert.equal(Object.hasOwn(controller, "update"), false);
  assert.equal(Object.hasOwn(controller, "delete"), false);
  for (const id of [0, -1, 1.5, NaN, 2147483648]) {
    await assert.rejects(service.update(1, id, { title: "Changed" }));
    await assert.rejects(service.delete(1, id));
  }
  await assert.rejects(service.update(1, 1, {}));
});
