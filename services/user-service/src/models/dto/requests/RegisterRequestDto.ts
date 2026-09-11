import "reflect-metadata";

import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from "class-validator";

import StringTransformer from "../../../utils/StringTransformer";
import { MaxUtf8Bytes } from "../../../utils/ValidationDecorators";

class RegisterRequestDto {
  static readonly extraFieldsMessage = "Only username, email and password are allowed.";

  @Transform(StringTransformer.trim)
  @Matches(/^[^\u0000-\u001f\u007f]*$/u, {
    message: "Username must contain at most 50 characters and no control characters.",
  })
  @MaxLength(50, { message: "Username must contain at most 50 characters and no control characters." })
  @IsNotEmpty({ message: "Username is required." })
  @IsString({ message: "Username is required." })
  declare username: string;

  @Transform(StringTransformer.normalizeEmail)
  @IsEmail({}, { message: "A valid email address of at most 255 characters is required." })
  @MaxLength(255, { message: "A valid email address of at most 255 characters is required." })
  @IsString({ message: "A valid email address is required." })
  declare email: string;

  @MaxUtf8Bytes(72, { message: "Password must contain at most 72 UTF-8 bytes." })
  @MinLength(8, { message: "Password must contain at least 8 characters." })
  @IsString({ message: "Password must contain at least 8 characters." })
  declare password: string;
}

export { RegisterRequestDto };
