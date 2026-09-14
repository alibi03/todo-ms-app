import type Task from "../../models/domain/Task";
import type CreateTaskModel from "../../models/domain/CreateTaskModel";

interface ITaskRepository {
  create(task: CreateTaskModel): Promise<Task>;
  listByOwner(ownerUserId: number, after: number, limit: number): Promise<Task[]>;
}

export type { ITaskRepository };
