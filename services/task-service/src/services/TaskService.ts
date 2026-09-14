import { ValidationError } from "../errors/ValidationError";
import type { ITaskRepository } from "../interfaces/repositories/ITaskRepository";
import type { ITaskService } from "../interfaces/services/ITaskService";
import CreateTaskModel from "../models/domain/CreateTaskModel";
import type Task from "../models/domain/Task";
import type { CreateTaskRequestDto } from "../models/dto/requests/CreateTaskRequestDto";
import type { ListTasksQueryDto } from "../models/dto/requests/ListTasksQueryDto";
import type { TaskPage } from "../models/dto/results/TaskPage";

class TaskService implements ITaskService {
  constructor(private readonly tasks: ITaskRepository) {}

  async create(ownerUserId: number, input: CreateTaskRequestDto): Promise<Task> {
    return this.tasks.create(new CreateTaskModel(input.title, input.description ?? "", ownerUserId));
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
    const rows = await this.tasks.listByOwner(ownerUserId, after, limit + 1);
    const tasks = rows.slice(0, limit);
    return { tasks, nextCursor: rows.length > limit ? tasks.at(-1)?.id ?? null : null };
  }
}

export default TaskService;
