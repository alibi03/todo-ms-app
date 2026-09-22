import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./ApiClient";
import { UserService } from "./UserService";
import { TaskService } from "./TaskService";

afterEach(() => vi.unstubAllGlobals());

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("API boundary", () => {
  it("keeps credentials in the bearer header and pagination in the query", async () => {
    const fetchMock = respond({ tasks: [], nextCursor: null });
    await new TaskService(new ApiClient("test-token")).list(21);
    const [path, options] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/tasks?limit=20&after=21");
    expect(options.headers.get("Authorization")).toBe("Bearer test-token");
    expect(options.redirect).toBe("error");
    expect(options.cache).toBe("no-store");
  });

  it("expires authenticated sessions on 401 even when the body is malformed", async () => {
    const expire = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{", {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      new UserService(new ApiClient("test-token", expire)).profile(),
    ).rejects.toThrow();
    expect(expire).toHaveBeenCalledOnce();
  });

  it("preserves the session and hides internal server errors on 503", async () => {
    const expire = vi.fn();
    respond({ message: "database password=private" }, 503);
    await expect(
      new UserService(new ApiClient("test-token", expire)).profile(),
    ).rejects.toMatchObject({
      status: 503,
      message: "The service is temporarily unavailable. Please try again.",
    });
    expect(expire).not.toHaveBeenCalled();
  });

  it("rejects malformed success payloads before rendering", async () => {
    respond({ tasks: [{ id: 1, status: "unknown" }], nextCursor: null });
    await expect(
      new TaskService(new ApiClient("test-token")).list(),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("keeps meaningful validation errors", async () => {
    respond({ message: "Assigned user does not exist." }, 400);
    await expect(
      new TaskService(new ApiClient("test-token")).create({
        title: "Task",
        description: "",
        assignedToUserId: 999,
        dueDate: null,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Assigned user does not exist.",
    });
  });

  it("supports empty delete responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    await expect(
      new TaskService(new ApiClient("test-token")).delete(1),
    ).resolves.toBeUndefined();
  });

  it("does not send owner fields with an assignee's status-only update", async () => {
    const fetchMock = respond({
      task: {
        id: 1,
        title: "Task",
        description: "",
        status: "completed",
        ownerUserId: 1,
        assignedToUserId: 2,
        dueDate: null,
        createdAt: "2026-09-22T12:00:00.000Z",
      },
    });
    await new TaskService(new ApiClient("test-token")).update(1, {
      status: "completed",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      status: "completed",
    });
  });

  it("turns network failures into a safe retryable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("private host")),
    );
    await expect(
      new UserService(new ApiClient()).login(
        "user@example.test",
        "test-password",
      ),
    ).rejects.toMatchObject({
      status: 0,
      message: "The service could not be reached. Please try again.",
    });
  });
});
