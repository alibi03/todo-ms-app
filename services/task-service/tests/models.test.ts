import assert from "node:assert/strict";
import test from "node:test";
import { TaskMapper } from "../src/mappers/TaskMapper";
import { TaskResponseMapper } from "../src/mappers/TaskResponseMapper";
import { Task } from "../src/models/domain/Task";
import { UserProfileDto } from "../src/models/dto/responses/UserProfileDto";
import { UserProfileResponseDto } from "../src/models/dto/responses/UserProfileResponseDto";
import { ResponseValidator } from "../src/utils/ResponseValidator";

test("profile validation creates nested DTOs and keeps only consumed fields", async () => {
  const payload = { user: { id: 12, email: "test@example.test", role: "member" }, version: 2 };
  const profile = await ResponseValidator.validate(UserProfileResponseDto, payload);
  assert.ok(profile instanceof UserProfileResponseDto);
  assert.ok(profile.user instanceof UserProfileDto);
  assert.deepEqual({ ...profile }, { user: profile.user });
  assert.deepEqual({ ...profile.user }, { id: 12 });
  assert.equal(payload.user.email, "test@example.test");
  assert.equal(payload.version, 2);
});

test("profile IDs accept database integer boundaries without coercion", async () => {
  for (const id of [1, 2147483647]) {
    const profile = await ResponseValidator.validate(UserProfileResponseDto, { user: { id } });
    assert.equal(profile.user.id, id);
  }
  for (const id of [undefined, null, "1", true, 0, -1, 1.5, 2147483648, NaN, Infinity, {}, []]) {
    await assert.rejects(ResponseValidator.validate(UserProfileResponseDto, { user: { id } }));
  }
});

test("task mapping renames database fields without copying unrelated data", () => {
  const createdAt = new Date("2026-01-01T12:00:00Z");
  const row = {
    id: 4, title: "Task", description: "Details", status: "in_progress" as const,
    owner_user_id: 7, created_at: createdAt, password_hash: "private",
    ownerUserId: 99, createdAt: new Date("2025-01-01T00:00:00Z"),
  };
  const task = TaskMapper.toDomain(row);
  assert.ok(task instanceof Task);
  assert.deepEqual({ ...task }, {
    id: 4, title: "Task", description: "Details", status: "in_progress", ownerUserId: 7, createdAt,
  });
  assert.equal(task.createdAt, createdAt);
  assert.deepEqual(TaskResponseMapper.toResponse(task), {
    id: 4, title: "Task", description: "Details", status: "in_progress",
    ownerUserId: 7, createdAt: createdAt.toISOString(),
  });
  assert.equal(row.owner_user_id, 7);
  assert.equal(row.ownerUserId, 99);
});
