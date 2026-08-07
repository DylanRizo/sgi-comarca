import {
  type ValidationOptions,
  ValidateBy,
  buildMessage,
} from 'class-validator';

export function CodePointLength(
  minimum: number,
  maximum: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      constraints: [minimum, maximum],
      name: 'codePointLength',
      validator: {
        defaultMessage: buildMessage(
          (prefix) =>
            `${prefix}$property must contain between $constraint1 and $constraint2 code points`,
          validationOptions,
        ),
        validate: (value, validationArguments): boolean => {
          if (typeof value !== 'string') return false;
          const [minimumLength, maximumLength] =
            validationArguments?.constraints as [number, number];
          const length = [...value].length;
          return length >= minimumLength && length <= maximumLength;
        },
      },
    },
    validationOptions,
  );
}

export function IsCanonicalAuthToken(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'canonicalAuthToken',
      validator: {
        defaultMessage: buildMessage(
          (prefix) =>
            `${prefix}$property must be a canonical authentication token`,
          validationOptions,
        ),
        validate: (value): boolean => {
          if (
            typeof value !== 'string' ||
            !/^[A-Za-z0-9_-]{43}$/u.test(value)
          ) {
            return false;
          }
          const decoded = Buffer.from(value, 'base64url');
          return (
            decoded.length === 32 && decoded.toString('base64url') === value
          );
        },
      },
    },
    validationOptions,
  );
}
