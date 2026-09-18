import type { Task } from "../../models/domain/Task";
import type { CreateTaskRequestDto } from "../../models/dto/requests/CreateTaskRequestDto";
import type { ListTasksQueryDto } from "../../models/dto/requests/ListTasksQueryDto";
import type { TaskPage } from "../../models/dto/results/TaskPage";
import type { UpdateTaskRequestDto } from "../../models/dto/requests/UpdateTaskRequestDto";

interface ITaskService {
  create(ownerUserId: number, input: CreateTaskRequestDto, token: string): Promise<Task>;
  list(userId: number, query: ListTasksQueryDto): Promise<TaskPage>;
  update(userId: number, id: number, input: UpdateTaskRequestDto, token: string): Promise<Task>;
  delete(ownerUserId: number, id: number): Promise<void>;
}

export type { ITaskService };
