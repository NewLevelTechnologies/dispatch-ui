/**
 * Tailwind's Preflight is unlayered in this app, and it sets
 *
 *     button, input, optgroup, select, textarea { font: inherit }
 *
 * `font` is a shorthand, so that carries the body's SIZE and WEIGHT onto every
 * form control — and an unlayered declaration beats a layered utility no matter
 * how specific the utility is. So `text-[11.5px]` and `font-semibold` on a
 * `<button>` silently lose, and the control renders at the body's 13px/400.
 *
 * It fails quietly: nothing errors, nothing warns, and the result looks like a
 * deliberately quiet style rather than a bug. It cost four separate corrections
 * on the dispatch board's chrome alone before anyone noticed the pattern.
 *
 * The fix is the important modifier — `!text-[11.5px]`, `!font-semibold` —
 * which this rule asks for, with an auto-fix.
 *
 * Scope, stated honestly: this checks `className` on JSX elements that render a
 * form control — the intrinsics plus a configurable list of component names.
 * It cannot see class strings assembled far from the element, such as a size
 * map in a primitive's module scope, so it is a net, not a proof. Primitives
 * that build class strings in variables still need the modifier applied by
 * hand.
 */

/** Utilities that `font: inherit` overrides. Deliberately narrow: only the two
 *  properties the shorthand actually carries — NOT colour, which the shorthand
 *  leaves alone. An arbitrary size starts with a digit (`text-[11.5px]`), which
 *  is what separates it from `text-[var(--warning-fg)]` and `text-[#fff]`. */
const FONT_SIZE = /(^|\s)(text-\[\d[^\]]*\]|text-(xs|sm|base|lg|xl|\d?xl))(?=\s|$)/;
const FONT_WEIGHT =
  /(^|\s)font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[[^\]]+\])(?=\s|$)/;

const DEFAULT_CONTROLS = [
  'button',
  'select',
  'input',
  'textarea',
  // Headless UI and the Catalyst wrappers around it all render one of the above.
  'Button',
  'Select',
  'Input',
  'Textarea',
  'ListboxButton',
  'MenuButton',
  'DropdownButton',
  'DisclosureButton',
  'TabButton',
];

/** `Headless.ListboxButton` → `ListboxButton`; `button` → `button`. */
function elementName(node) {
  const name = node.name;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression' && name.property.type === 'JSXIdentifier') {
    return name.property.name;
  }
  return null;
}

/** Every string literal reachable from a className value, including the ones
 *  inside a clsx()/clsx-like call or a ternary. */
function stringLiterals(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string') out.push(node);
      break;
    case 'TemplateLiteral':
      node.quasis.forEach((q) => {
        if (q.value.raw) out.push(q);
      });
      break;
    case 'JSXExpressionContainer':
      stringLiterals(node.expression, out);
      break;
    case 'ConditionalExpression':
      stringLiterals(node.consequent, out);
      stringLiterals(node.alternate, out);
      break;
    case 'LogicalExpression':
      stringLiterals(node.left, out);
      stringLiterals(node.right, out);
      break;
    case 'CallExpression':
      node.arguments.forEach((arg) => stringLiterals(arg, out));
      break;
    case 'ArrayExpression':
      node.elements.forEach((el) => stringLiterals(el, out));
      break;
    case 'ObjectExpression':
      node.properties.forEach((prop) => {
        if (prop.type === 'Property') stringLiterals(prop.key, out);
      });
      break;
    default:
      break;
  }
  return out;
}

function rawOf(node) {
  return node.type === 'TemplateElement' ? node.value.raw : node.value;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Require the important modifier on font-size and font-weight utilities applied to form controls, which unlayered Preflight's `font: inherit` would otherwise override",
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          controls: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      needsImportant:
        "`{{utility}}` will not apply here: Preflight's unlayered `font: inherit` on <{{element}}> beats it, so this renders at the body's size and weight. Use `!{{utility}}`.",
    },
  },

  create(context) {
    const controls = new Set(context.options[0]?.controls ?? DEFAULT_CONTROLS);

    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'className') return;

        const element = node.parent;
        if (element.type !== 'JSXOpeningElement') return;
        const name = elementName(element);
        if (!name || !controls.has(name)) return;

        for (const literal of stringLiterals(node.value)) {
          const raw = rawOf(literal);
          for (const pattern of [FONT_SIZE, FONT_WEIGHT]) {
            const match = pattern.exec(raw);
            if (!match) continue;
            const utility = match[0].trim();
            context.report({
              node: literal,
              messageId: 'needsImportant',
              data: { utility, element: name },
              fix(fixer) {
                const start = literal.range[0] + raw.indexOf(utility) + 1;
                return fixer.insertTextBeforeRange([start, start], '!');
              },
            });
          }
        }
      },
    };
  },
};
