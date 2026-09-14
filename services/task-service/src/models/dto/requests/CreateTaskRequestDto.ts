import "reflect-metadata";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, Matches, MaxLength, ValidateIf } from "class-validator";
import StringTransformer from "../../../utils/StringTransformer";

class CreateTaskRequestDto {
  static readonly extraFieldsMessage = "Only title and description are allowed.";

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
}

export { CreateTaskRequestDto };
