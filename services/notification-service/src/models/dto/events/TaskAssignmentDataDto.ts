import "reflect-metadata";
import { IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min } from "class-validator";

export class TaskAssignmentDataDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  taskId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  recipientUserId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[^\u0000-\u001f\u007f]*$/u)
  title!: string;
}
