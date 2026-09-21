import "reflect-metadata";
import { Expose } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

export class UserProfileDto {
  @Expose()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id!: number;
}
