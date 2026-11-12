// ESLint (configuração "flat") do front, dos testes e dos scripts.
// As Cloud Functions têm a configuração própria, em functions/eslint.config.js.
const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
  { ignores: ['node_modules/', 'functions/', '_build/', '.firebase/', 'dist/', 'js/config.js'] },
  js.configs.recommended,
  {
    // front: módulos ES no navegador
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    // js/inicio.js é um script clássico, carregado antes do módulo
    files: ['js/inicio.js'],
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['service-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['scripts/**/*.js', 'assets/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    rules: {
      // catch vazio é intencional (localStorage, JSON e rede que podem falhar sem importar)
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true,
      }],
    },
  },
]
