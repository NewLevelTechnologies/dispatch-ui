import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import i18next from 'eslint-plugin-i18next'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import inheritedFontOnFormControl from './eslint-rules/inherited-font-on-form-control.js'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'handoff', 'claude_designs']),
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
      // Local rules live in ./eslint-rules and are wired inline — flat config
      // takes a plugin object directly, so this needs no extra dependency.
      local: { rules: { 'inherited-font-on-form-control': inheritedFontOnFormControl } },
    },
    rules: {
      // Preflight is unlayered here, so `font: inherit` on form controls beats
      // any layered size or weight utility. Four separate corrections on the
      // dispatch board's chrome came from this before the pattern was spotted;
      // it fails silently and looks like a style choice.
      'local/inherited-font-on-form-control': 'error',

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
