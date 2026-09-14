import type TaskDatabase from "../database/TaskDatabase";
import type { ITaskRepository } from "../interfaces/repositories/ITaskRepository";
import TaskMapper from "../mappers/TaskMapper";
import type { TaskRecord } from "../models/database/TaskRecord";
import type CreateTaskModel from "../models/domain/CreateTaskModel";
import type Task from "../models/domain/Task";
import type UpdateTaskModel from "../models/domain/UpdateTaskModel";

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

  async updateByOwner(id: number, ownerUserId: number, input: UpdateTaskModel): Promise<Task | null> {
    const result = await this.database.query<TaskRecord>(
      `UPDATE tasks SET title = COALESCE($3, title), description = COALESCE($4, description),
       status = COALESCE($5, status)
       WHERE id = $1 AND owner_user_id = $2
       RETURNING id, title, description, status, owner_user_id, created_at`,
      [id, ownerUserId, input.title ?? null, input.description ?? null, input.status ?? null]
    );
    const row = result.rows[0];
    return row ? TaskMapper.toDomain(row) : null;
  }

  async deleteByOwner(id: number, ownerUserId: number): Promise<boolean> {
    const result = await this.database.query(
      "DELETE FROM tasks WHERE id = $1 AND owner_user_id = $2",
      [id, ownerUserId]
    );
    return result.rowCount === 1;
  }
}

export default TaskRepository;
