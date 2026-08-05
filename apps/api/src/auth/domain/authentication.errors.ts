export class AuthenticationError extends Error {
  constructor() {
    super('Authentication failed.');
    this.name = 'AuthenticationError';
  }
}

export class ActivationError extends Error {
  constructor() {
    super('Activation failed.');
    this.name = 'ActivationError';
  }
}

export class PasswordPolicyError extends Error {
  constructor(
    public readonly code:
      'COMMON_PASSWORD' | 'INVALID_LENGTH' | 'SIMILAR_TO_IDENTIFIER',
  ) {
    super('Password does not satisfy the approved policy.');
    this.name = 'PasswordPolicyError';
  }
}

export class SessionError extends Error {
  constructor() {
    super('Session is not active.');
    this.name = 'SessionError';
  }
}

export class AuthenticationInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationInvariantError';
  }
}
