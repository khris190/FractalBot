import js from '@eslint/js'
import tsEslint from 'typescript-eslint'
import globals from 'globals'
import neostandard from 'neostandard'

export default tsEslint.config(
  neostandard({ ts: true }),
  {
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.node }
    },
    rules: {

    },
  }
)
