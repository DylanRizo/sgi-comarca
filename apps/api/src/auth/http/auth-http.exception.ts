import { HttpException, HttpStatus } from '@nestjs/common';

export type AuthPublicErrorCode =
  | 'ACTIVATION_FAILED'
  | 'ADMIN_ACCESS_PROTECTED'
  | 'ADMIN_OPERATION_CONFLICT'
  | 'ADMIN_PERMISSION_RESTRICTED'
  | 'ADMIN_ROLE_NOT_EDITABLE'
  | 'ADMIN_UNKNOWN_CODE'
  | 'ADMIN_USER_NOT_FOUND'
  | 'ADMIN_USER_STATE_CONFLICT'
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_REQUEST'
  | 'PASSWORD_POLICY_REJECTED'
  | 'REQUEST_VERIFICATION_FAILED'
  | 'SESSION_INVALID'
  | 'LAST_ADMIN_PROTECTED';

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

  static adminOperationConflict(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.CONFLICT,
      'ADMIN_OPERATION_CONFLICT',
      'La operacion administrativa entro en conflicto.',
    );
  }

  static adminAccessProtected(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ADMIN_ACCESS_PROTECTED',
      'La cuenta administradora no puede perder el acceso al panel.',
    );
  }

  static adminPermissionRestricted(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ADMIN_PERMISSION_RESTRICTED',
      'Ese permiso solo puede concederse a la cuenta administradora.',
    );
  }

  static adminRoleNotEditable(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'ADMIN_ROLE_NOT_EDITABLE',
      'El rol ADMIN no se asigna ni se retira desde el panel.',
    );
  }

  static adminUnknownCode(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.BAD_REQUEST,
      'ADMIN_UNKNOWN_CODE',
      'Algun rol o permiso solicitado no existe.',
    );
  }

  static adminUserNotFound(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.NOT_FOUND,
      'ADMIN_USER_NOT_FOUND',
      'No se encontro el usuario solicitado.',
    );
  }

  static adminUserStateConflict(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.CONFLICT,
      'ADMIN_USER_STATE_CONFLICT',
      'El estado del usuario no permite la operacion.',
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

  static lastAdminProtected(): AuthHttpException {
    return new AuthHttpException(
      HttpStatus.CONFLICT,
      'LAST_ADMIN_PROTECTED',
      'La operacion dejaria al sistema sin un administrador habilitado.',
    );
  }
}
