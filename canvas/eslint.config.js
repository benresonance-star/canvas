import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.es2021,
        process: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['public/audio-worklets/**/*.js'],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
      },
    },
    rules: {
      'no-redeclare': 'off',
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['server/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/lib/image/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: [
      'src/components/AddMenu.jsx',
      'src/features/flow/components/FlowEditorContext.jsx',
      'src/features/flow/components/FlowPreview.jsx',
      'src/features/music/kernel/MusicKernelProvider.jsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/__tests__/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
])
