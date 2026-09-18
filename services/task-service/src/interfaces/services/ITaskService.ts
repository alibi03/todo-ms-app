import type { Task } from "../../models/domain/Task";
import type { CreateTaskRequestDto } from "../../models/dto/requests/CreateTaskRequestDto";
import type { ListTasksQueryDto } from "../../models/dto/requests/ListTasksQueryDto";
import type { TaskPage } from "../../models/dto/results/TaskPage";
import type { UpdateTaskRequestDto } from "../../models/dto/requests/UpdateTaskRequestDto";

interface ITaskService {
  create(ownerUserId: number, input: CreateTaskRequestDto): Promise<Task>;
  list(ownerUserId: number, query: ListTasksQueryDto): Promise<TaskPage>;
  update(ownerUserId: number, id: number, input: UpdateTaskRequestDto): Promise<Task>;
  delete(ownerUserId: number, id: number): Promise<void>;
}

export type { ITaskService };
