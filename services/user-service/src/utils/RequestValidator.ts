import { plainToInstance, type ClassConstructor } from "class-transformer";
import { validate } from "class-validator";

import { ValidationError } from "../errors/ApplicationErrors";

type RequestDtoClass<T> = ClassConstructor<T> & { readonly extraFieldsMessage: string };

class RequestValidator {
  static async validate<T extends object>(dtoClass: RequestDtoClass<T>, value: unknown): Promise<T> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ValidationError("Request data must be an object.");
    }

    let dto: T;

    try {
      dto = plainToInstance(dtoClass, value, { enableImplicitConversion: false });
    } catch (error) {
      // Malformed nested values can fail during transformation, before validation.
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ValidationError("Request data must contain valid field values.");
      }
      throw error;
    }

    // Reject keys the transformer discards, such as constructor and __proto__.
    if (Object.keys(value).some((key) => !Object.hasOwn(dto, key))) {
      throw new ValidationError(dtoClass.extraFieldsMessage);
    }

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: true,
      validationError: { target: false, value: false },
    });

    if (errors.some((error) => error.constraints?.whitelistValidation)) {
      throw new ValidationError(dtoClass.extraFieldsMessage);
    }

    const firstError = errors[0];

    if (firstError) {
      const message = Object.values(firstError.constraints ?? {})[0];
      throw new ValidationError(message ?? "Request validation failed.");
    }

    return dto;
  }
}

export default RequestValidator;
