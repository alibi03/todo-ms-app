import "reflect-metadata";

import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";

import StringTransformer from "../../../utils/StringTransformer";
import { MaxUtf8Bytes } from "../../../utils/ValidationDecorators";

class LoginRequestDto {
  static readonly extraFieldsMessage = "Only email and password are allowed.";

  @Transform(StringTransformer.normalizeEmail)
  @IsEmail({}, { message: "A valid email address of at most 255 characters is required." })
  @MaxLength(255, { message: "A valid email address of at most 255 characters is required." })
  @IsString({ message: "A valid email address is required." })
  declare email: string;

  @MaxUtf8Bytes(72, { message: "Password must contain at most 72 UTF-8 bytes." })
  @IsNotEmpty({ message: "Password is required." })
  @IsString({ message: "Password is required." })
  declare password: string;
}

export { LoginRequestDto };
