import "reflect-metadata";
import { Matches } from "class-validator";

export class UserIdParamsDto {
  static readonly extraFieldsMessage = "Only the user ID is allowed.";

  @Matches(/^[1-9]\d{0,9}$/, { message: "User ID must be a positive integer." })
  declare id: string;
}
