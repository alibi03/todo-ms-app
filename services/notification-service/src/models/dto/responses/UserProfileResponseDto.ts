import "reflect-metadata";
import { Expose, Type } from "class-transformer";
import { IsDefined, IsObject, ValidateNested } from "class-validator";
import { UserProfileDto } from "./UserProfileDto";

export class UserProfileResponseDto {
  @Expose()
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => UserProfileDto)
  user!: UserProfileDto;
}
