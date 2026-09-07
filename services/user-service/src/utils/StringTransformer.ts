import type { TransformFnParams } from "class-transformer";

class StringTransformer {
  static trim({ value }: TransformFnParams): unknown {
    return typeof value === "string" ? value.trim() : value;
  }

  static normalizeEmail({ value }: TransformFnParams): unknown {
    return typeof value === "string" ? value.trim().toLowerCase() : value;
  }
}

export default StringTransformer;
