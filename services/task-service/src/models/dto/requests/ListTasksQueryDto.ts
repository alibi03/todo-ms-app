import "reflect-metadata";
import { Matches, ValidateIf } from "class-validator";

class ListTasksQueryDto {
  static readonly extraFieldsMessage = "Only limit and after are allowed.";

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Matches(/^(?:[1-9]|[1-9]\d|100)$/, { message: "Limit must be between 1 and 100." })
  declare limit?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Matches(/^(?:0|[1-9]\d{0,9})$/, { message: "After must be a non-negative task ID." })
  declare after?: string;
}

export { ListTasksQueryDto };
