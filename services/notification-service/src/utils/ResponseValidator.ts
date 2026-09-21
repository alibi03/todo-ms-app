import { plainToInstance, type ClassConstructor } from "class-transformer";
import { validate } from "class-validator";

export class ResponseValidator {
  static async validate<T extends object>(dtoClass: ClassConstructor<T>, value: unknown): Promise<T> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Invalid service response.");
    }

    const dto = plainToInstance(dtoClass, value, {
      enableImplicitConversion: false,
      excludeExtraneousValues: true,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidUnknownValues: true,
      stopAtFirstError: true,
      validationError: { target: false, value: false },
    });

    if (errors.length > 0) throw new Error("Invalid service response.");
    return dto;
  }
}
