import type TaskDatabase from "../database/TaskDatabase";
import type { ITaskRepository } from "../interfaces/repositories/ITaskRepository";
import TaskMapper from "../mappers/TaskMapper";
import type { TaskRecord } from "../models/database/TaskRecord";
import type CreateTaskModel from "../models/domain/CreateTaskModel";
import type Task from "../models/domain/Task";

class TaskRepository implements ITaskRepository {
  constructor(private readonly database: Pick<TaskDatabase, "query">) {}

  async create(task: CreateTaskModel): Promise<Task> {
    const result = await this.database.query<TaskRecord>(
      `INSERT INTO tasks (title, description, owner_user_id) VALUES ($1, $2, $3)
       RETURNING id, title, description, status, owner_user_id, created_at`,
      [task.title, task.description, task.ownerUserId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Task insert returned no row.");
    return TaskMapper.toDomain(row);
  }

  async listByOwner(ownerUserId: number, after: number, limit: number): Promise<Task[]> {
    const result = await this.database.query<TaskRecord>(
      `SELECT id, title, description, status, owner_user_id, created_at FROM tasks
       WHERE owner_user_id = $1 AND id > $2 ORDER BY id ASC LIMIT $3`,
      [ownerUserId, after, limit]
    );
    return result.rows.map(TaskMapper.toDomain);
  }
}

export default TaskRepository;
