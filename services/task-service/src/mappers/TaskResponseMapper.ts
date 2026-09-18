import type { Task } from "../models/domain/Task";
import type { TaskResponse } from "../models/dto/responses/TaskResponse";

export class TaskResponseMapper {
  static toResponse(task: Task): TaskResponse {
    return {
      id: task.id, title: task.title, description: task.description,
      status: task.status, ownerUserId: task.ownerUserId, createdAt: task.createdAt.toISOString(),
    };
  }
}
