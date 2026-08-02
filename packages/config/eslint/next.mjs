import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

export default [
  ...nextVitals,
  ...nextTypescript,
  prettier,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];
