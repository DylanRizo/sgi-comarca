import globals from 'globals';

import base from './base.mjs';

export default [
  ...base,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
