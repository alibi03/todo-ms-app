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
      `WITH inserted AS (
         INSERT INTO tasks (title, description, owner_user_id, assigned_to_user_id, due_date)
         VALUES ($1, $2, $3, $4, $5) RETURNING *
       ), enqueued AS (
         INSERT INTO task_outbox (event_type, task_id, recipient_user_id, title)
         SELECT 'task.assigned', id, assigned_to_user_id, title FROM inserted
         WHERE assigned_to_user_id IS NOT NULL
       ) SELECT ${taskColumns} FROM inserted`,
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
      `WITH current AS MATERIALIZED (
         SELECT * FROM tasks WHERE id = $1 FOR UPDATE
       ), changed AS (
         UPDATE tasks AS task SET title = COALESCE($3, current.title),
         description = COALESCE($4, current.description), status = COALESCE($5, current.status),
         assigned_to_user_id = CASE WHEN $6::boolean THEN $7::integer ELSE current.assigned_to_user_id END,
         due_date = CASE WHEN $8::boolean THEN $9::date ELSE current.due_date END
         FROM current WHERE task.id = current.id
           AND (current.owner_user_id = $2 OR (current.assigned_to_user_id = $2 AND $10::boolean))
         RETURNING task.*
       ), enqueued AS (
         INSERT INTO task_outbox (event_type, task_id, recipient_user_id, title)
         SELECT CASE WHEN current.assigned_to_user_id IS NULL THEN 'task.assigned' ELSE 'task.reassigned' END,
           changed.id, changed.assigned_to_user_id, changed.title
         FROM changed JOIN current ON changed.id = current.id
         WHERE changed.assigned_to_user_id IS NOT NULL
           AND changed.assigned_to_user_id IS DISTINCT FROM current.assigned_to_user_id
       ) SELECT ${taskColumns} FROM changed`,
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
