import "reflect-metadata";
import { Matches } from "class-validator";

class TaskIdParamsDto {
  static readonly extraFieldsMessage = "Only the task ID is allowed.";

  @Matches(/^[1-9]\d{0,9}$/, { message: "Task ID must be a positive integer." })
  declare id: string;
}

export { TaskIdParamsDto };
