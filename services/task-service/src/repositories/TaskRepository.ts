import type { TaskDatabase } from "../database/TaskDatabase";
import type { ITaskRepository } from "../interfaces/repositories/ITaskRepository";
import { TaskMapper } from "../mappers/TaskMapper";
import type { TaskRecord } from "../models/database/TaskRecord";
import type { CreateTaskModel } from "../models/domain/CreateTaskModel";
import type { Task } from "../models/domain/Task";
import type { UpdateTaskModel } from "../models/domain/UpdateTaskModel";

const taskColumns = "id, title, description, status, owner_user_id, assigned_to_user_id, to_char(due_date, 'YYYY-MM-DD') AS due_date, created_at";

export class TaskRepository implements ITaskRepository {
  constructor(private readonly database: Pick<TaskDatabase, "query">) {}

  async create(task: CreateTaskModel): Promise<Task> {
    const result = await this.database.query<TaskRecord>(
      `INSERT INTO tasks (title, description, owner_user_id, assigned_to_user_id, due_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${taskColumns}`,
      [task.title, task.description, task.ownerUserId, task.assignedToUserId, task.dueDate]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Task insert returned no row.");
    return TaskMapper.toDomain(row);
  }

  async listForUser(userId: number, after: number, limit: number): Promise<Task[]> {
    const result = await this.database.query<TaskRecord>(
      `SELECT ${taskColumns} FROM tasks
       WHERE (owner_user_id = $1 OR assigned_to_user_id = $1) AND id > $2 ORDER BY id ASC LIMIT $3`,
      [userId, after, limit]
    );
    return result.rows.map(TaskMapper.toDomain);
  }

  async findVisibleById(id: number, userId: number): Promise<Task | null> {
    const result = await this.database.query<TaskRecord>(
      `SELECT ${taskColumns} FROM tasks WHERE id = $1 AND (owner_user_id = $2 OR assigned_to_user_id = $2)`,
      [id, userId]
    );
    const row = result.rows[0];
    return row ? TaskMapper.toDomain(row) : null;
  }

  async updateForUser(id: number, userId: number, input: UpdateTaskModel): Promise<Task | null> {
    const result = await this.database.query<TaskRecord>(
      `UPDATE tasks SET title = COALESCE($3, title), description = COALESCE($4, description),
       status = COALESCE($5, status),
       assigned_to_user_id = CASE WHEN $6::boolean THEN $7::integer ELSE assigned_to_user_id END,
       due_date = CASE WHEN $8::boolean THEN $9::date ELSE due_date END
       WHERE id = $1 AND (owner_user_id = $2 OR (assigned_to_user_id = $2 AND $10::boolean))
       RETURNING ${taskColumns}`,
      [id, userId, input.title ?? null, input.description ?? null, input.status ?? null,
        input.assignedToUserId !== undefined, input.assignedToUserId ?? null,
        input.dueDate !== undefined, input.dueDate ?? null, input.isStatusOnly()]
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
