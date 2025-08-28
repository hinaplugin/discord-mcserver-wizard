// eslint.config.js

 
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/naming-convention */

import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
    {
        ignores: ["dist/**/*", "node_modules/**/*", "**/*.d.ts", "*.config.js", "*.config.ts"],
    },
    // Plugins
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    jsdoc.configs['flat/recommended-typescript'],
    eslintConfigPrettier,
    // /Plugins
    {
        files: ["src/**/*.ts", "src/**/*.js"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: true,
                sourceType: 'module',
            },
        },
        rules: {
            'unicode-bom': ['error', 'never'],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            'no-var': 'off',
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'VariableDeclaration[kind=\'var\'][declare!=true]',
                    message: 'Unexpected var, use let or const instead.',
                },
            ],
            eqeqeq: 'warn',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'spaced-comment': ['warn', 'always'],
            '@typescript-eslint/naming-convention': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            'jsdoc/check-param-names': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/require-param-description': 'off',
            'jsdoc/require-returns': 'off',
            'jsdoc/require-param-type': 'off',
            'jsdoc/require-returns-type': 'off',
            'jsdoc/require-jsdoc': 'off',
        },
    }
];
