import js from '@eslint/js'
import globals from 'globals'
import neostandard from 'neostandard'

export default neostandard(
  {
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.node }
    },
    rules: {

    },
  }
)
