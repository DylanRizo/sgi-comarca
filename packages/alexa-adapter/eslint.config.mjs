import nodeConfig from '@sgi/config/eslint/node';

export default [
  ...nodeConfig,
  {
    files: ['alexa-hosted/lambda/index.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
