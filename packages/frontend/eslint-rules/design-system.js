/**
 * 自定义 ESLint 规则：设计规范类名检查
 *
 * 禁止使用非语义化的 Tailwind 类，强制使用 DESIGN_SYSTEM.md 规范的语义化 Token
 */

/** @type {import('eslint').Rule.RuleModule} */
const noNonSemanticClasses = {
  meta: {
    type: 'suggestion',
    docs: {
      description: '禁止使用非语义化的 Tailwind 类，应使用设计规范定义的语义化 Token',
      category: 'Stylistic Issues',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      // 圆角规则
      useRoundedCard: '请使用 "rounded-card" 替代 "{{found}}"',
      useRoundedButton: '请使用 "rounded-button" 替代 "{{found}}"',
      useRoundedInput: '请使用 "rounded-input" 替代 "{{found}}"',

      // 阴影规则
      useShadowSoft: '请使用 "shadow-soft" 替代 "{{found}}"',
      useShadowElevated: '请使用 "shadow-elevated" 替代 "{{found}}"',
      useShadowFloating: '请使用 "shadow-floating" 替代 "{{found}}"',

      // 动画时长规则
      useDurationG3Fast: '请使用 "duration-g3-fast" 替代 "{{found}}"',
      useDurationG3Normal: '请使用 "duration-g3-normal" 替代 "{{found}}"',
      useDurationG3Slow: '请使用 "duration-g3-slow" 替代 "{{found}}"',
      useDurationG3Slower: '请使用 "duration-g3-slower" 替代 "{{found}}"',

      // 缓动规则
      useEaseG3: '请使用 "ease-g3" 替代 "{{found}}"',
    },
  },
  create(context) {
    // 禁止的类名映射到建议的替换和对应的消息 ID
    const forbiddenClasses = {
      // 圆角
      'rounded-xl': { replacement: 'rounded-card', messageId: 'useRoundedCard' },
      'rounded-2xl': { replacement: 'rounded-card', messageId: 'useRoundedCard' },
      'rounded-lg': { replacement: 'rounded-button', messageId: 'useRoundedButton' },

      // 阴影
      'shadow-sm': { replacement: 'shadow-soft', messageId: 'useShadowSoft' },
      'shadow-md': { replacement: 'shadow-elevated', messageId: 'useShadowElevated' },
      'shadow-lg': { replacement: 'shadow-elevated', messageId: 'useShadowElevated' },
      'shadow-xl': { replacement: 'shadow-floating', messageId: 'useShadowFloating' },

      // 动画时长
      'duration-150': { replacement: 'duration-g3-instant', messageId: 'useDurationG3Fast' },
      'duration-200': { replacement: 'duration-g3-fast', messageId: 'useDurationG3Fast' },
      'duration-300': { replacement: 'duration-g3-normal', messageId: 'useDurationG3Normal' },
      'duration-500': { replacement: 'duration-g3-slow', messageId: 'useDurationG3Slow' },
      'duration-700': { replacement: 'duration-g3-slower', messageId: 'useDurationG3Slower' },
      'duration-1000': { replacement: 'duration-g3-slower', messageId: 'useDurationG3Slower' },
    };

    /**
     * 检查字符串字面量中的类名
     */
    function checkClassNames(node, value) {
      if (typeof value !== 'string') return;

      const classes = value.split(/\s+/);

      for (const className of classes) {
        // 检查基础类名
        const baseClass = className.replace(/^(hover:|focus:|active:|disabled:)/, '');

        if (forbiddenClasses[baseClass]) {
          const { replacement, messageId } = forbiddenClasses[baseClass];
          const prefix = className.startsWith('hover:')
            ? 'hover:'
            : className.startsWith('focus:')
              ? 'focus:'
              : className.startsWith('active:')
                ? 'active:'
                : className.startsWith('disabled:')
                  ? 'disabled:'
                  : '';

          context.report({
            node,
            messageId,
            data: { found: className },
            fix(fixer) {
              const newValue = value.replace(
                new RegExp(`\\b${className}\\b`, 'g'),
                prefix + replacement,
              );
              return fixer.replaceText(node, `"${newValue}"`);
            },
          });
        }
      }
    }

    return {
      // 检查 JSX 属性中的 className
      JSXAttribute(node) {
        if (node.name.name !== 'className') return;

        if (node.value && node.value.type === 'Literal') {
          checkClassNames(node.value, node.value.value);
        }
      },

      // 检查模板字符串中的类名 (cn 函数等)
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          checkClassNames(quasi, quasi.value.raw);
        }
      },
    };
  },
};

/**
 * 建议使用预定义按钮组件类的规则
 */
const preferBtnClasses = {
  meta: {
    type: 'suggestion',
    docs: {
      description: '建议使用 btn-primary / btn-secondary 等预定义按钮类',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
    messages: {
      useBtnPrimary: '检测到复杂的主按钮样式，建议使用 "btn-primary" 组件类',
      useBtnSecondary: '检测到复杂的次要按钮样式，建议使用 "btn-secondary" 组件类',
    },
  },
  create(context) {
    // 主按钮的特征模式
    const primaryButtonPatterns = [/bg-blue-500.*text-white/, /bg-gradient-to-br from-blue-500/];

    // 次要按钮的特征模式
    const secondaryButtonPatterns = [/bg-white.*border.*border-gray/, /bg-gray-100.*text-gray/];

    function checkButtonPatterns(node, value) {
      if (typeof value !== 'string') return;

      for (const pattern of primaryButtonPatterns) {
        if (pattern.test(value)) {
          context.report({
            node,
            messageId: 'useBtnPrimary',
          });
          return;
        }
      }

      for (const pattern of secondaryButtonPatterns) {
        if (pattern.test(value)) {
          context.report({
            node,
            messageId: 'useBtnSecondary',
          });
          return;
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className') return;

        // 只检查 button 元素
        const parent = node.parent;
        if (parent.type !== 'JSXOpeningElement') return;
        if (parent.name.type !== 'JSXIdentifier' || parent.name.name !== 'button') return;

        if (node.value && node.value.type === 'Literal') {
          checkButtonPatterns(node.value, node.value.value);
        }
      },
    };
  },
};

export const rules = {
  'no-non-semantic-classes': noNonSemanticClasses,
  'prefer-btn-classes': preferBtnClasses,
};

export default { rules };
