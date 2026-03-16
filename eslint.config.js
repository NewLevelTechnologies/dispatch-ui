import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import i18next from 'eslint-plugin-i18next'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      i18next,
    },
    rules: {
      // Enforce internationalization - no hardcoded strings in JSX
      'i18next/no-literal-string': ['error', {
        markupOnly: true, // Only check JSX markup, not all strings
        ignoreAttribute: [
          // Component/HTML attributes that should allow literals
          'className', 'style', 'type', 'id', 'name',
          'data-testid', 'data-*', 'aria-*',
          'role', 'htmlFor', 'for',
          // React Router
          'to', 'path',
          // Form attributes
          'method', 'action', 'encType',
        ],
        ignoreCallee: [
          // Allow console messages (debug strings)
          'console.error', 'console.log', 'console.warn', 'console.info',
        ],
        ignore: [
          // Single characters, punctuation, and symbols
          /^[0-9]+$/, // Pure numbers
          /^[A-Z]{1,3}$/, // Single letters or short acronyms (ID, USD, etc)
          /^[.,;:!?()[\]{}<>'"`~@#$%^&*+=|\\/\-_]+$/, // Punctuation only
        ],
      }],
    },
  },
])
