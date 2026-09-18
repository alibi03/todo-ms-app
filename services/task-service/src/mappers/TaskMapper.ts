import { Task } from "../models/domain/Task";
import type { TaskRecord } from "../models/database/TaskRecord";

export class TaskMapper {
  static toDomain(row: TaskRecord): Task {
    const { owner_user_id, created_at, ...fields } = row;
    return new Task({ ...fields, ownerUserId: owner_user_id, createdAt: created_at });
  }
}
