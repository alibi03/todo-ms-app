import assert from "node:assert/strict";
import test from "node:test";
import createApp from "../src/app";
import TaskController from "../src/controllers/TaskController";
import { AuthenticationError } from "../src/errors/AuthenticationError";
import { DependencyUnavailableError } from "../src/errors/DependencyUnavailableError";
import type { ITaskRepository } from "../src/interfaces/repositories/ITaskRepository";
import type { IUserServiceClient } from "../src/interfaces/services/IUserServiceClient";
import Task from "../src/models/domain/Task";
import { CreateTaskRequestDto } from "../src/models/dto/requests/CreateTaskRequestDto";
import TaskResponseMapper from "../src/mappers/TaskResponseMapper";
import TaskService from "../src/services/TaskService";
import RequestValidator from "../src/utils/RequestValidator";
import withServer from "./testServer";

function fixture(users?: IUserServiceClient) {
  const rows: Task[] = [];
  const logs: unknown[][] = [];
  const repository: ITaskRepository = {
    async create(input) {
      const task = new Task(rows.length + 1, input.title, input.description, "pending", input.ownerUserId, new Date());
      rows.push(task);
      return task;
    },
    async listByOwner(owner, after, limit) {
      return rows.filter(row => row.ownerUserId === owner && row.id > after).slice(0, limit);
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
  const task = Object.assign(new Task(1, "Task", "", "pending", 1, new Date()), { passwordHash: "private" });
  assert.equal("passwordHash" in TaskResponseMapper.toResponse(task), false);
});

test("service rejects unbounded pagination even when called without a controller", async () => {
  const service = new TaskService(fixture().repository);
  for (const limit of ["0", "101", "NaN", "1.5"]) {
    await assert.rejects(service.list(1, { limit }));
  }
});
