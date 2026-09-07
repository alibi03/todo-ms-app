import { registerDecorator, type ValidationOptions } from "class-validator";

function MaxUtf8Bytes(maximum: number, options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: "maxUtf8Bytes",
      target: target.constructor,
      propertyName: String(propertyKey),
      constraints: [maximum],
      options,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === "string" && Buffer.byteLength(value, "utf8") <= maximum;
        },
      },
    });
  };
}

export { MaxUtf8Bytes };
