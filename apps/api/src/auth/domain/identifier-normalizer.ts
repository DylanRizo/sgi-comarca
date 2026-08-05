export class IdentifierNormalizer {
  normalize(identifier: string): string {
    return identifier.normalize('NFC').trim().toLocaleLowerCase('und');
  }

  comparable(value: string): string {
    return value
      .normalize('NFC')
      .toLocaleLowerCase('und')
      .replace(/[\p{White_Space}\p{Punctuation}\p{Symbol}]/gu, '');
  }
}
