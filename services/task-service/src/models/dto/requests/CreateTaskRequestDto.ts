import "reflect-metadata";
import { Transform } from "class-transformer";
import { IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min, Validate, ValidateIf } from "class-validator";
import { DateOnlyValidator } from "../../../utils/DateOnlyValidator";
import { StringTransformer } from "../../../utils/StringTransformer";

export class CreateTaskRequestDto {
  static readonly extraFieldsMessage = "Only title, description, assignedToUserId and dueDate are allowed.";

  @Transform(StringTransformer.trim)
  @Matches(/^[^\u0000-\u001f\u007f]*$/u, { message: "Title cannot contain control characters." })
  @MaxLength(200, { message: "Title must contain at most 200 characters." })
  @IsNotEmpty({ message: "Title is required." })
  @IsString({ message: "Title must be text." })
  declare title: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(StringTransformer.trim)
  @Matches(/^[^\u0000]*$/u, { message: "Description cannot contain null characters." })
  @MaxLength(2000, { message: "Description must contain at most 2000 characters." })
  @IsString({ message: "Description must be text." })
  declare description?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsInt({ message: "Assignee must be a valid user ID." })
  @Min(1, { message: "Assignee must be a valid user ID." })
  @Max(2147483647, { message: "Assignee must be a valid user ID." })
  declare assignedToUserId?: number | null;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Validate(DateOnlyValidator)
  declare dueDate?: string | null;
}
