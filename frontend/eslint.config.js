// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist', 'android', 'ios', 'node_modules', '*.config.*', 'public'],
  },
  js.configs.recommended,
  // 타입 정보 없는 recommended — 빠른 실행을 위해 type-checked 는 사용하지 않는다.
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        __FE_COMMIT_HASH__: 'readonly',
        __FE_BUILD_TIME__: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React #310 ("Rendered more hooks than during the previous render") 방지 — 항상 error
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // 린트를 처음 도입하는 코드베이스 — 기존 코드가 많아 우선 warn 으로 시작한다.
      // (lint:strict / lint-staged 는 --max-warnings=0 이라 새로 추가되는 코드에는 사실상 error)
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-useless-escape': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      // ESLint 10 recommended 에 새로 들어온 규칙들 — 기존 코드 정리 전까지 warn
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-control-regex': 'warn',
    },
  },
  {
    // 테스트 파일: vitest 전역(describe/it/expect) 허용
    files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
);
