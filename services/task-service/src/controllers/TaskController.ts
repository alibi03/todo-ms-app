import type { Request, Response } from "express";
import type { ITaskService } from "../interfaces/services/ITaskService";
import { TaskResponseMapper } from "../mappers/TaskResponseMapper";
import { CreateTaskRequestDto } from "../models/dto/requests/CreateTaskRequestDto";
import { ListTasksQueryDto } from "../models/dto/requests/ListTasksQueryDto";
import type { CreateTaskResponse } from "../models/dto/responses/CreateTaskResponse";
import type { ListTasksResponse } from "../models/dto/responses/ListTasksResponse";
import type AuthenticatedLocals from "../types/AuthenticatedLocals";
import { RequestValidator } from "../utils/RequestValidator";
import { TaskIdParamsDto } from "../models/dto/requests/TaskIdParamsDto";
import { UpdateTaskRequestDto } from "../models/dto/requests/UpdateTaskRequestDto";
import type { UpdateTaskResponse } from "../models/dto/responses/UpdateTaskResponse";

export class TaskController {
  constructor(private readonly taskService: ITaskService) {}

  async create(request: Request, response: Response<CreateTaskResponse, AuthenticatedLocals>): Promise<void> {
    const input = await RequestValidator.validate(CreateTaskRequestDto, request.body);
    const task = await this.taskService.create(response.locals.userId, input);
    response.status(201).json({ task: TaskResponseMapper.toResponse(task) });
  }

  async list(request: Request, response: Response<ListTasksResponse, AuthenticatedLocals>): Promise<void> {
    const query = await RequestValidator.validate(ListTasksQueryDto, request.query);
    const page = await this.taskService.list(response.locals.userId, query);
    response.json({ tasks: page.tasks.map(TaskResponseMapper.toResponse), nextCursor: page.nextCursor });
  }

  async update(request: Request, response: Response<UpdateTaskResponse, AuthenticatedLocals>): Promise<void> {
    const params = await RequestValidator.validate(TaskIdParamsDto, request.params);
    const input = await RequestValidator.validate(UpdateTaskRequestDto, request.body);
    const task = await this.taskService.update(response.locals.userId, Number(params.id), input);
    response.json({ task: TaskResponseMapper.toResponse(task) });
  }

  async delete(request: Request, response: Response<void, AuthenticatedLocals>): Promise<void> {
    const params = await RequestValidator.validate(TaskIdParamsDto, request.params);
    await this.taskService.delete(response.locals.userId, Number(params.id));
    response.status(204).end();
  }
}
