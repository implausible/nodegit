module.exports = {
    extends: 'airbnb-base',
    rules: {
      'arrow-parens': ['error', 'always'],
      camelcase: [0, { allow: [/(?:static)|(?:proto)_.*/] }],
      'func-names': 'off',
      'implicit-arrow-linebreak': 'off',
      'no-await-in-loop': 'off',
      'no-cond-assign': ['error', 'except-parens'],
      'no-confusing-arrow': 'off',
      'no-param-reassign': ['error', { props: false }],
      'no-plusplus': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'LabeledStatement',
          message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
        },
        {
          selector: 'WithStatement',
          message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
        },
      ],
      'no-underscore-dangle': 'off',
      'space-before-function-paren': ['error', {
        anonymous: 'never',
        asyncArrow: 'always',
        named: 'never',
      }],
    }
};
