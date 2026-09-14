import type Task from "../../models/domain/Task";
import type { CreateTaskRequestDto } from "../../models/dto/requests/CreateTaskRequestDto";
import type { ListTasksQueryDto } from "../../models/dto/requests/ListTasksQueryDto";
import type { TaskPage } from "../../models/dto/results/TaskPage";

interface ITaskService {
  create(ownerUserId: number, input: CreateTaskRequestDto): Promise<Task>;
  list(ownerUserId: number, query: ListTasksQueryDto): Promise<TaskPage>;
}

export type { ITaskService };
