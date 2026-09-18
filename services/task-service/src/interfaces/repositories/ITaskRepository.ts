import type { Task } from "../../models/domain/Task";
import type { CreateTaskModel } from "../../models/domain/CreateTaskModel";
import type { UpdateTaskModel } from "../../models/domain/UpdateTaskModel";

interface ITaskRepository {
  create(task: CreateTaskModel): Promise<Task>;
  listByOwner(ownerUserId: number, after: number, limit: number): Promise<Task[]>;
  updateByOwner(id: number, ownerUserId: number, input: UpdateTaskModel): Promise<Task | null>;
  deleteByOwner(id: number, ownerUserId: number): Promise<boolean>;
}

export type { ITaskRepository };
