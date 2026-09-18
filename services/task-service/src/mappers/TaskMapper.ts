import { Task } from "../models/domain/Task";
import type { TaskRecord } from "../models/database/TaskRecord";

export class TaskMapper {
  static toDomain(row: TaskRecord): Task {
    const { owner_user_id, assigned_to_user_id, due_date, created_at, ...fields } = row;
    return new Task({
      ...fields, ownerUserId: owner_user_id, assignedToUserId: assigned_to_user_id,
      dueDate: due_date, createdAt: created_at,
    });
  }
}
