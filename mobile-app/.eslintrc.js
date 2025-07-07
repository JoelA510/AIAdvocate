// mobile-app/.eslintrc.js
module.exports = {
  root: true,
  extends: ['expo', 'prettier'],
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': 'error',
  },
  settings: {
    'import/resolver': {
      typescript: {}, // This is the key line that tells ESLint to use TypeScript's path resolution
    },
  },
};