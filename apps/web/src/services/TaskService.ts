import { z } from "zod";
import { taskPageResponseSchema } from "../models/dto/responses/TaskPageResponse";
import { taskResponseSchema } from "../models/dto/responses/TaskResponse";
import type { CreateTaskRequest } from "../models/dto/requests/CreateTaskRequest";
import type { UpdateTaskRequest } from "../models/dto/requests/UpdateTaskRequest";
import { ApiClient } from "./ApiClient";

const taskResultSchema = z.object({ task: taskResponseSchema });

export class TaskService {
  constructor(private readonly apiClient: ApiClient) {}

  list(after?: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: "20" });
    if (after !== undefined) query.set("after", String(after));
    return this.apiClient.request(
      "/api/tasks?" + query,
      taskPageResponseSchema,
      { signal },
    );
  }

  create(input: CreateTaskRequest) {
    return this.apiClient.request("/api/tasks", taskResultSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  update(id: number, input: UpdateTaskRequest) {
    return this.apiClient.request("/api/tasks/" + id, taskResultSchema, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  delete(id: number) {
    return this.apiClient.request("/api/tasks/" + id, z.undefined(), {
      method: "DELETE",
    });
  }
}
