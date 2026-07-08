import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

const NUMERIC_ID_RE = /^\d{1,20}$/;

@Injectable()
export class NumericIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!NUMERIC_ID_RE.test(value)) {
      throw new BadRequestException(`Invalid ID: must be numeric`);
    }
    return value;
  }
}
