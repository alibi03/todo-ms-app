import type { TaskStatus } from "../../types/TaskStatus";
import type { TaskProperties } from "./TaskProperties";

export class Task implements TaskProperties {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly ownerUserId: number;
  readonly createdAt: Date;

  constructor(properties: TaskProperties) {
    this.id = properties.id;
    this.title = properties.title;
    this.description = properties.description;
    this.status = properties.status;
    this.ownerUserId = properties.ownerUserId;
    this.createdAt = properties.createdAt;
  }
}
