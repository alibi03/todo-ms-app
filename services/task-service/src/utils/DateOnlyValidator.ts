import { ValidatorConstraint, type ValidatorConstraintInterface } from "class-validator";

@ValidatorConstraint({ name: "dateOnly", async: false })
export class DateOnlyValidator implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  defaultMessage(): string {
    return "Due date must be a real date in YYYY-MM-DD format.";
  }
}
