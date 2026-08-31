import { ValidationPipe } from '@nestjs/common';
import { IsIn, IsString, Matches } from 'class-validator';

const isoDate = /^\d{4}-\d{2}-\d{2}$/u;

export class SalesAnalyticsQueryDto {
  @IsString()
  @Matches(isoDate, { message: 'from must be an ISO date (YYYY-MM-DD).' })
  from!: string;

  @IsString()
  @Matches(isoDate, { message: 'to must be an ISO date (YYYY-MM-DD).' })
  to!: string;

  @IsIn(['day', 'month', 'week'])
  granularity: 'day' | 'month' | 'week' = 'day';
}

function analyticsQueryPipe(expectedType: new () => object): ValidationPipe {
  return new ValidationPipe({
    expectedType,
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  });
}

export const salesAnalyticsQueryPipe = analyticsQueryPipe(
  SalesAnalyticsQueryDto,
);
