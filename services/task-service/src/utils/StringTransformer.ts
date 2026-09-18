import type { TransformFnParams } from "class-transformer";

export class StringTransformer {
  static trim({ value }: TransformFnParams): unknown {
    return typeof value === "string" ? value.trim() : value;
  }

  static normalizeEmail({ value }: TransformFnParams): unknown {
    return typeof value === "string" ? value.trim().toLowerCase() : value;
  }
}
