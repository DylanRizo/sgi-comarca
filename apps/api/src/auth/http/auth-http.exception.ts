import { HttpException, HttpStatus } from '@nestjs/common';

export type AuthPublicErrorCode =
  | 'ACTIVATION_FAILED'
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_REQUEST'
  | 'PASSWORD_POLICY_REJECTED'
  | 'REQUEST_VERIFICATION_FAILED'
  | 'SESSION_INVALID';

export class AuthHttpException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly publicCode: AuthPublicErrorCode,
    readonly publicMessage: string,
  ) {
    super(publicMessage, status);
  }

  static activationFailed(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.BAD_REQUEST,
      'ACTIVATION_FAILED',
      'No fue posible activar la cuenta.',
    );
  }

  static authenticationFailed(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.UNAUTHORIZED,
      'AUTHENTICATION_FAILED',
      'No fue posible autenticar la solicitud.',
    );
  }

  static passwordPolicyRejected(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'PASSWORD_POLICY_REJECTED',
      'La contrasena nueva no cumple la politica aprobada.',
    );
  }

  static requestVerificationFailed(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.FORBIDDEN,
      'REQUEST_VERIFICATION_FAILED',
      'No fue posible verificar la solicitud.',
    );
  }

  static sessionInvalid(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.UNAUTHORIZED,
      'SESSION_INVALID',
      'La sesion no es valida.',
    );
  }
}
