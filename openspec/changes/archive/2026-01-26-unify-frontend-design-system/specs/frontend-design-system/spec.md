## ADDED Requirements

### Requirement: Unified Icon System

The frontend SHALL use Phosphor Icons as the single icon library, with all icons exported through the centralized `Icon.tsx` component using **duotone** weight.

#### Scenario: Icon Import Pattern

- **WHEN** a component needs an icon
- **THEN** it MUST import from `./Icon` or `../components/Icon`
- **AND** it MUST NOT import directly from `@phosphor-icons/react`

#### Scenario: No Emoji in Production UI (Full Scope)

- **WHEN** rendering any user-facing content (hardcoded UI, CMS content, Markdown)
- **THEN** the system MUST NOT display Unicode emoji characters
- **AND** it MUST replace emoji with Phosphor Icons (duotone weight)
- **AND** the Markdown/CMS rendering pipeline MUST sanitize emoji before render

#### Scenario: Icon Weight Standardization

- **WHEN** using any Phosphor Icon
- **THEN** it MUST use `weight="duotone"` (or rely on default)
- **AND** it MUST NOT use regular/bold/fill weights unless explicitly documented

#### Scenario: Emoji Allowed in Non-UI Contexts

- **WHEN** writing console logs, test mocks, or Storybook examples
- **THEN** emoji usage is permitted

### Requirement: Unified Color System

The frontend SHALL use blue as the primary color for all main actions and interactive elements.

#### Scenario: Global Indigo Ban

- **WHEN** styling any UI element
- **THEN** it MUST NOT use any `indigo-*` color classes
- **AND** all existing `indigo-*` usages MUST be replaced with `blue-*`

#### Scenario: Primary Action Color

- **WHEN** rendering a primary action button or interactive element
- **THEN** it MUST use `blue-500` to `blue-600` gradient
- **AND** it MUST NOT use `indigo-*` colors

#### Scenario: Focus Ring Color

- **WHEN** an element receives focus
- **THEN** the focus ring MUST use `blue-500`
- **AND** it MUST NOT use `indigo-500` or `purple-500`

#### Scenario: Purple Usage (Learning Domain Only)

- **WHEN** rendering learning-related features:
  - Mastery indicators
  - Flashcard mode
  - Progress tracking
  - Achievement/badge displays
  - Study statistics
- **THEN** purple colors MAY be used for semantic differentiation
- **AND** this is the ONLY context where purple is permitted
- **AND** purple MUST NOT appear in Admin, Settings, or general UI

#### Scenario: Gradient Rules

- **WHEN** using gradients for primary actions
- **THEN** it MUST use `from-blue-500 to-blue-600` (blue-to-blue)
- **WHEN** using gradients in learning contexts
- **THEN** it MAY use `from-blue-50 to-purple-50` (blue-to-purple)
- **AND** no other gradient combinations are permitted

#### Scenario: Semantic Colors

- **WHEN** indicating success state
- **THEN** use `green-500` / `green-600`
- **WHEN** indicating error/danger state
- **THEN** use `red-500` / `red-600`
- **WHEN** indicating warning state
- **THEN** use `amber-500` / `amber-600`

#### Scenario: Dark Mode Sync

- **WHEN** replacing any color class
- **THEN** the corresponding `dark:` variant MUST also be updated
- **AND** no component may have light-mode colors without dark-mode equivalents

#### Scenario: WCAG AA Compliance

- **WHEN** any text is rendered on a colored background
- **THEN** the contrast ratio MUST be ≥ 4.5:1 (WCAG AA)
- **AND** this applies to both light and dark themes
- **AND** disabled states are exempt from this requirement

### Requirement: Unified Border Radius System

The frontend SHALL use design system tokens for all border radius values.

#### Scenario: Button Border Radius

- **WHEN** styling a button element
- **THEN** it MUST use `rounded-button` (0.75rem)
- **AND** it MUST NOT use `rounded-lg`, `rounded-xl`

#### Scenario: Compact Context Exception

- **WHEN** a button is inside a compact context (Table, Toolbar, Pagination, InputGroup)
- **THEN** it MAY use `rounded-md` (0.375rem)
- **AND** this is the ONLY exception to the `rounded-button` rule

#### Scenario: Card Border Radius

- **WHEN** styling a card container
- **THEN** it MUST use `rounded-card` (1rem)
- **AND** it MUST NOT use `rounded-lg`, `rounded-xl`, or `rounded-2xl`

#### Scenario: Input Border Radius

- **WHEN** styling an input element
- **THEN** it MUST use `rounded-input` (0.625rem)

#### Scenario: Badge Border Radius

- **WHEN** styling a badge element
- **THEN** it MUST use `rounded-badge` (0.5rem)

#### Scenario: Icon Button Exception

- **WHEN** styling an icon-only button
- **THEN** it MAY use `rounded-full` for circular appearance

### Requirement: Unified Shadow System

The frontend SHALL use design system shadow tokens with strict elevation mapping.

#### Scenario: Three-Tier Shadow Mapping

- **WHEN** applying shadow to a Card
- **THEN** it MUST use `shadow-soft`
- **WHEN** applying shadow to a Modal or Dropdown
- **THEN** it MUST use `shadow-elevated`
- **WHEN** applying shadow to a Tooltip or Popover
- **THEN** it MUST use `shadow-floating`

#### Scenario: Button Shadow

- **WHEN** applying shadow to a button
- **THEN** it MUST use `shadow-button-rest`, `shadow-button-hover`, or `shadow-button-active`
- **AND** it MUST NOT use generic shadow classes

#### Scenario: Hover Shadow Transition

- **WHEN** applying hover shadow effect to a card
- **THEN** it MUST use `hover:shadow-elevated`
- **AND** it MUST NOT use `hover:shadow-md` or `hover:shadow-lg`

### Requirement: Unified Transition System

The frontend SHALL use G3 animation timing for all transitions.

#### Scenario: Standard Transition

- **WHEN** applying transition to an interactive element
- **THEN** it MUST use `transition-all duration-g3-fast ease-g3`
- **AND** it MUST NOT use `transition-colors` alone

#### Scenario: Button Scale Animation

- **WHEN** styling an interactive button
- **THEN** it MUST include `active:scale-[0.98]` or `active:scale-95`

### Requirement: Unified Card Style

The frontend SHALL use consistent glass morphism styling for cards.

#### Scenario: Card Background

- **WHEN** styling a card with transparency
- **THEN** it MUST use `bg-white/80 backdrop-blur-sm`
- **AND** opacity MUST be `/80` (not `/90` or other values)

#### Scenario: Card Border

- **WHEN** styling a card border
- **THEN** it MUST use `border border-gray-200/60`

### Requirement: Button Component Migration

The frontend SHALL migrate ALL raw `<button>` elements to the Button component.

#### Scenario: Mandatory Button Component Usage

- **WHEN** rendering any button element
- **THEN** it MUST use `<Button>` component from `src/components/ui/Button.tsx`
- **AND** raw `<button>` tags are FORBIDDEN in application code
- **AND** the only exception is `Button.tsx` itself

#### Scenario: Button Variant Selection

- **WHEN** a primary action is needed
- **THEN** use `<Button variant="primary">`
- **WHEN** a secondary action is needed
- **THEN** use `<Button variant="secondary">`
- **WHEN** a destructive action is needed
- **THEN** use `<Button variant="danger">`

---

## Property-Based Testing (PBT) Properties

### [INVARIANT] Icon System Integrity

- **Property**: All visual iconography renders via `<Icon />` from `Icon.tsx` with duotone weight
- **Falsification**: AST scan for direct `@phosphor-icons/react` imports outside `Icon.tsx`; regex for emoji Unicode ranges in rendered output

### [INVARIANT] Indigo Color Ban

- **Property**: Zero occurrences of `indigo-` substring in any class list or style definition
- **Falsification**: `grep -r "indigo-" src/` must return empty

### [INVARIANT] Purple Domain Restriction

- **Property**: `purple-*` tokens only appear in files matching `/(learning|flashcard|study|mastery|achievement|progress)/i`
- **Falsification**: Script scanning purple usage against file path whitelist

### [INVARIANT] Button Encapsulation

- **Property**: AST contains zero `<button>` JSX elements outside `Button.tsx`
- **Falsification**: AST traversal flagging raw button tags with file:line locations

### [INVARIANT] Shadow Elevation Mapping

- **Property**: Card→soft, Modal/Dropdown→elevated, Tooltip/Popover→floating
- **Falsification**: Static analysis mapping component names to shadow tokens

### [INVARIANT] WCAG AA Contrast

- **Property**: All text/background pairs have contrast ratio ≥ 4.5:1
- **Falsification**: Extract color pairs, compute contrast, flag violations

### [INVARIANT] Dark Mode Completeness

- **Property**: Every light-mode color class has corresponding dark: variant
- **Falsification**: Diff class lists between themes, flag missing dark variants

### [INVARIANT] Radius Context Compliance

- **Property**: `rounded-md` only in compact contexts; `rounded-button` elsewhere
- **Falsification**: AST check parent component against allowed compact list

---

## Migration Strategy

### Phase 1: Foundation (Infrastructure)

1. Update `Icon.tsx` with missing icons (duotone weight)
2. Verify `tailwind.config.js` tokens are complete
3. Ensure `Button.tsx` supports all required variants

### Phase 2: Admin Pages (Low Risk)

1. Migrate `src/pages/admin/*.tsx` (~12 files)
2. Update admin components
3. Validate with Playwright screenshots

### Phase 3: User Pages (Core)

1. Migrate `src/pages/*.tsx` (~15 files)
2. Update shared components
3. Full visual regression test

### Phase 4: Cleanup

1. Remove legacy tokens
2. Add ESLint rules for enforcement
3. Update documentation
