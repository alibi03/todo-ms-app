import { ValidationError } from "../errors/ValidationError";
import { NotFoundError } from "../errors/NotFoundError";
import { AuthenticationError } from "../errors/AuthenticationError";
import { AuthorizationError } from "../errors/AuthorizationError";
import type { IUserServiceClient } from "../interfaces/services/IUserServiceClient";
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
  constructor(
    private readonly taskRepository: ITaskRepository,
    private readonly userServiceClient: IUserServiceClient
  ) {}

  async create(ownerUserId: number, input: CreateTaskRequestDto, token: string): Promise<Task> {
    await this.validateAssignee(input.assignedToUserId, token);
    return this.taskRepository.create(new CreateTaskModel({
      title: input.title, description: input.description ?? "", ownerUserId,
      assignedToUserId: input.assignedToUserId ?? null, dueDate: input.dueDate ?? null,
    }));
  }

  async list(userId: number, query: ListTasksQueryDto): Promise<TaskPage> {
    const limit = Number(query.limit ?? 20);
    const after = Number(query.after ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError("Limit must be between 1 and 100.");
    }
    if (!Number.isSafeInteger(after) || after < 0 || after > 2147483647) {
      throw new ValidationError("After must be a valid task ID.");
    }
    const rows = await this.taskRepository.listForUser(userId, after, limit + 1);
    const tasks = rows.slice(0, limit);
    return { tasks, nextCursor: rows.length > limit ? tasks.at(-1)?.id ?? null : null };
  }

  async update(userId: number, id: number, input: UpdateTaskRequestDto, token: string): Promise<Task> {
    this.validateId(id);
    if (input.title === undefined && input.description === undefined && input.status === undefined
      && input.assignedToUserId === undefined && input.dueDate === undefined) {
      throw new ValidationError("Provide at least one field to update.");
    }
    const existing = await this.taskRepository.findVisibleById(id, userId);
    if (!existing) throw new NotFoundError("Task not found.");
    const update = new UpdateTaskModel(input);
    if (existing.ownerUserId !== userId && !update.isStatusOnly()) {
      throw new AuthorizationError("Assignees can only change task status.");
    }
    await this.validateAssignee(input.assignedToUserId, token);
    const task = await this.taskRepository.updateForUser(id, userId, update);
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

  private async validateAssignee(id: number | null | undefined, token: string): Promise<void> {
    if (id === undefined || id === null) return;
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
      throw new ValidationError("Assignee must be a valid user ID.");
    }
    if (!token) throw new AuthenticationError("A Bearer token is required.");
    if (!await this.userServiceClient.getUserById(token, id)) {
      throw new ValidationError("Assigned user does not exist.");
    }
  }
}
