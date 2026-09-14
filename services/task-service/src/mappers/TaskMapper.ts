import Task from "../models/domain/Task";
import type { TaskRecord } from "../models/database/TaskRecord";

class TaskMapper {
  static toDomain(row: TaskRecord): Task {
    return new Task(row.id, row.title, row.description, row.status, row.owner_user_id, row.created_at);
  }
}

export default TaskMapper;
