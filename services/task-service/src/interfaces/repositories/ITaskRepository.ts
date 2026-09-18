import type { Task } from "../../models/domain/Task";
import type { CreateTaskModel } from "../../models/domain/CreateTaskModel";
import type { UpdateTaskModel } from "../../models/domain/UpdateTaskModel";

interface ITaskRepository {
  create(task: CreateTaskModel): Promise<Task>;
  listForUser(userId: number, after: number, limit: number): Promise<Task[]>;
  findVisibleById(id: number, userId: number): Promise<Task | null>;
  updateForUser(id: number, userId: number, input: UpdateTaskModel): Promise<Task | null>;
  deleteByOwner(id: number, ownerUserId: number): Promise<boolean>;
}

export type { ITaskRepository };
