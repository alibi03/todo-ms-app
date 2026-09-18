import type { TaskStatus } from "../../types/TaskStatus";
import type { TaskProperties } from "./TaskProperties";

export class UpdateTaskModel {
  readonly title: string | undefined;
  readonly description: string | undefined;
  readonly status: TaskStatus | undefined;
  readonly assignedToUserId: number | null | undefined;
  readonly dueDate: string | null | undefined;

  constructor(properties: Partial<Pick<TaskProperties, "title" | "description" | "status" | "assignedToUserId" | "dueDate">>) {
    this.title = properties.title;
    this.description = properties.description;
    this.status = properties.status;
    this.assignedToUserId = properties.assignedToUserId;
    this.dueDate = properties.dueDate;
  }

  isStatusOnly(): boolean {
    return this.status !== undefined && this.title === undefined && this.description === undefined
      && this.assignedToUserId === undefined && this.dueDate === undefined;
  }
}
