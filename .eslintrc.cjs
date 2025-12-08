module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
    browser: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "import", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "plugin:prettier/recommended",
  ],
  rules: {
    "prettier/prettier": "warn",
    "import/no-unresolved": "off",
    "import/order": [
      "warn",
      {
        "alphabetize": { order: "asc", caseInsensitive: true },
        "newlines-between": "always",
        "groups": [["builtin", "external"], ["internal", "parent", "sibling", "index"]],
      },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".ts", ".jsx", ".tsx"],
      },
    },
  },
};

