import type { TaskProperties } from "./TaskProperties";

export class CreateTaskModel {
  readonly title: string;
  readonly description: string;
  readonly ownerUserId: number;
  readonly assignedToUserId: number | null;
  readonly dueDate: string | null;

  constructor(properties: Pick<TaskProperties, "title" | "description" | "ownerUserId" | "assignedToUserId" | "dueDate">) {
    this.title = properties.title;
    this.description = properties.description;
    this.ownerUserId = properties.ownerUserId;
    this.assignedToUserId = properties.assignedToUserId;
    this.dueDate = properties.dueDate;
  }
}
