import { HttpException } from '@nestjs/common';
import type { ReportPublicErrorCode } from '@sgi/contracts';

export class ReportsHttpException extends HttpException {
  constructor(
    readonly publicCode: ReportPublicErrorCode,
    readonly publicMessage: string,
    status: number,
  ) {
    super(publicMessage, status);
  }
}
