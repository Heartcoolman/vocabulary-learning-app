module.exports = {
  // TypeScript/JavaScript 文件 - 只在packages目录下运行eslint
  'packages/**/*.{ts,tsx}': ['pnpm exec eslint --fix', 'pnpm exec prettier --write'],

  // 根目录的JS配置文件
  '*.{js,cjs,mjs}': ['pnpm exec prettier --write'],

  // CSS/样式文件
  '**/*.{css,scss,less}': ['pnpm exec prettier --write'],

  // JSON 文件
  '**/*.json': ['pnpm exec prettier --write'],

  // Markdown 文件
  '**/*.md': ['pnpm exec prettier --write'],

  // YAML 文件
  '**/*.{yml,yaml}': ['pnpm exec prettier --write'],
};
