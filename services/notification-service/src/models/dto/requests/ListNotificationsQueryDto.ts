import "reflect-metadata";
import { Matches, ValidateIf } from "class-validator";

export class ListNotificationsQueryDto {
  static readonly extraFieldsMessage = "Only limit and before are allowed.";

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Matches(/^(?:[1-9]|[1-9]\d|100)$/, { message: "Limit must be between 1 and 100." })
  declare limit?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Matches(/^[1-9]\d{0,9}$/, { message: "Before must be a positive notification ID." })
  declare before?: string;
}
