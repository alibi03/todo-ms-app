import type { Request, Response } from "express";
import type { ITaskService } from "../interfaces/services/ITaskService";
import TaskResponseMapper from "../mappers/TaskResponseMapper";
import { CreateTaskRequestDto } from "../models/dto/requests/CreateTaskRequestDto";
import { ListTasksQueryDto } from "../models/dto/requests/ListTasksQueryDto";
import type { CreateTaskResponse } from "../models/dto/responses/CreateTaskResponse";
import type { ListTasksResponse } from "../models/dto/responses/ListTasksResponse";
import type AuthenticatedLocals from "../types/AuthenticatedLocals";
import RequestValidator from "../utils/RequestValidator";

class TaskController {
  constructor(private readonly tasks: ITaskService) {}

  async create(request: Request, response: Response<CreateTaskResponse, AuthenticatedLocals>): Promise<void> {
    const input = await RequestValidator.validate(CreateTaskRequestDto, request.body);
    const task = await this.tasks.create(response.locals.userId, input);
    response.status(201).json({ task: TaskResponseMapper.toResponse(task) });
  }

  async list(request: Request, response: Response<ListTasksResponse, AuthenticatedLocals>): Promise<void> {
    const query = await RequestValidator.validate(ListTasksQueryDto, request.query);
    const page = await this.tasks.list(response.locals.userId, query);
    response.json({ tasks: page.tasks.map(TaskResponseMapper.toResponse), nextCursor: page.nextCursor });
  }
}

export default TaskController;
