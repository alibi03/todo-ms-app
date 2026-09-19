import "reflect-metadata";
import { Type } from "class-transformer";
import { Equals, IsDefined, IsIn, IsISO8601, IsObject, IsUUID, Matches, ValidateNested } from "class-validator";
import { TaskAssignmentDataDto } from "./TaskAssignmentDataDto";

export class TaskAssignmentEventDto {
  static readonly extraFieldsMessage = "Unexpected event fields.";

  @IsUUID("4")
  eventId!: string;

  @Equals(1)
  version!: 1;

  @IsIn(["task.assigned", "task.reassigned"])
  type!: "task.assigned" | "task.reassigned";

  @IsISO8601({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  occurredAt!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TaskAssignmentDataDto)
  data!: TaskAssignmentDataDto;
}
