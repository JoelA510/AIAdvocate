import eslintPluginJs from '@eslint/js';

export default [
  {
    ignores: ['dist/**', 'coverage/**']
  },
  {
    ...eslintPluginJs.configs.recommended,
    languageOptions: {
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        process: 'readonly'
      }
    }
  }
];
