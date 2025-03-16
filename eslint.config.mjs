import tsEslint from 'typescript-eslint'
import globals from 'globals'
import neostandard from 'neostandard'
import tsParser from '@typescript-eslint/parser'

export default tsEslint.config(
  neostandard({ ts: true }),
  {
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.node },
      parser: tsParser
    },
    rules: {

    },
  }
)
