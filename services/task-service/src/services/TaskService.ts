import { ValidationError } from "../errors/ValidationError";
import { NotFoundError } from "../errors/NotFoundError";
import type { ITaskRepository } from "../interfaces/repositories/ITaskRepository";
import type { ITaskService } from "../interfaces/services/ITaskService";
import { CreateTaskModel } from "../models/domain/CreateTaskModel";
import type { Task } from "../models/domain/Task";
import type { CreateTaskRequestDto } from "../models/dto/requests/CreateTaskRequestDto";
import type { ListTasksQueryDto } from "../models/dto/requests/ListTasksQueryDto";
import type { TaskPage } from "../models/dto/results/TaskPage";
import { UpdateTaskModel } from "../models/domain/UpdateTaskModel";
import type { UpdateTaskRequestDto } from "../models/dto/requests/UpdateTaskRequestDto";

export class TaskService implements ITaskService {
  constructor(private readonly taskRepository: ITaskRepository) {}

  async create(ownerUserId: number, input: CreateTaskRequestDto): Promise<Task> {
    return this.taskRepository.create(new CreateTaskModel(input.title, input.description ?? "", ownerUserId));
  }

  async list(ownerUserId: number, query: ListTasksQueryDto): Promise<TaskPage> {
    const limit = Number(query.limit ?? 20);
    const after = Number(query.after ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError("Limit must be between 1 and 100.");
    }
    if (!Number.isSafeInteger(after) || after < 0 || after > 2147483647) {
      throw new ValidationError("After must be a valid task ID.");
    }
    const rows = await this.taskRepository.listByOwner(ownerUserId, after, limit + 1);
    const tasks = rows.slice(0, limit);
    return { tasks, nextCursor: rows.length > limit ? tasks.at(-1)?.id ?? null : null };
  }

  async update(ownerUserId: number, id: number, input: UpdateTaskRequestDto): Promise<Task> {
    this.validateId(id);
    if (input.title === undefined && input.description === undefined && input.status === undefined) {
      throw new ValidationError("Provide at least one field to update.");
    }
    const task = await this.taskRepository.updateByOwner(
      id, ownerUserId, new UpdateTaskModel(input.title, input.description, input.status)
    );
    if (!task) throw new NotFoundError("Task not found.");
    return task;
  }

  async delete(ownerUserId: number, id: number): Promise<void> {
    this.validateId(id);
    if (!await this.taskRepository.deleteByOwner(id, ownerUserId)) {
      throw new NotFoundError("Task not found.");
    }
  }

  private validateId(id: number): void {
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
      throw new ValidationError("Task ID must be a valid positive integer.");
    }
  }
}
