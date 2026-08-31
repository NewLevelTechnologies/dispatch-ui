// Shared ESLint config for the platform-agnostic @dispatch/* packages.
//
// Deliberately omits the React, react-refresh and i18next rules the web app
// uses: these packages contain no JSX and no user-facing strings, so those
// rules belong to the apps that render UI. Keeping them out also means a
// package never has to install a React toolchain just to lint.
//
// Lives at the workspace root so its plugin imports resolve from the root
// node_modules. Each package re-exports it from its own eslint.config.js.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      // These packages target both web and React Native, and their tests run
      // on Node — allow the globals common to all three.
      globals: { ...globals.node, ...globals.browser },
    },
  },
])
