import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

@Injectable()
export class GlobalValidationPipe implements PipeTransform<unknown> {
  async transform(
    value: unknown,
    { metatype }: ArgumentMetadata,
  ): Promise<unknown> {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors: ValidationError[] = await validate(object);

    if (errors.length > 0) {
      const messages = this.flattenErrors(errors);
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        errors: messages,
      });
    }

    return object;
  }

  private toValidate(metatype: new (...args: unknown[]) => unknown): boolean {
    const types: (new (...args: unknown[]) => unknown)[] = [
      String,
      Boolean,
      Number,
      Array,
      Object,
    ];
    return !types.includes(metatype);
  }

  private flattenErrors(
    errors: ValidationError[],
    parentPath = '',
  ): string[] {
    const result: string[] = [];

    for (const error of errors) {
      const propPath = parentPath
        ? `${parentPath}.${error.property}`
        : error.property;

      if (error.constraints) {
        result.push(
          ...Object.values(error.constraints).map(
            (msg) => `${propPath}: ${msg}`,
          ),
        );
      }

      if (error.children && error.children.length > 0) {
        result.push(...this.flattenErrors(error.children, propPath));
      }
    }

    return result;
  }
}
