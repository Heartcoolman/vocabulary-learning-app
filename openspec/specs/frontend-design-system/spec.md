# frontend-design-system Specification

## Purpose

TBD - created by archiving change unify-frontend-design-system. Update Purpose after archive.

## Requirements

### Requirement: Unified Icon System

The frontend SHALL use Phosphor Icons as the single icon library, with all icons exported through the centralized `Icon.tsx` component. The application SHALL use `IconContext.Provider` at root level to set **duotone** as the default weight.

#### Scenario: IconContext Default Weight

- **WHEN** the application renders
- **THEN** `App.tsx` MUST wrap the component tree with `IconContext.Provider`
- **AND** the provider value MUST set `weight: "duotone"`
- **AND** no other `IconContext.Provider` may override this default

#### Scenario: Icon Weight Standardization (Clarified)

- **WHEN** using any Phosphor Icon in component code
- **THEN** it MUST omit the `weight` prop (inheriting duotone from context)
- **AND** it MUST NOT include redundant `weight="duotone"` props
- **AND** it MUST NOT use `weight="bold"`, `weight="regular"`, or `weight="fill"` except for documented exceptions

#### Scenario: Fill/Bold Weight Exceptions

- **WHEN** rendering Star icons for rating/mastery display
- **THEN** it MAY use `weight="fill"` for filled state and `weight="regular"` for empty state
- **WHEN** rendering CircleNotch as a loading spinner
- **THEN** it MUST use `weight="bold"` with `className="animate-spin"`
- **WHEN** rendering Eye icon for password visibility toggle
- **THEN** it MAY use `weight="fill"` for visible state and `weight="regular"` for hidden state
- **WHEN** rendering icons with active/inactive toggle state (Tab, Nav, ThemeToggle)
- **THEN** it MAY use `weight="fill"` for active and `weight="regular"` for inactive
- **WHEN** rendering Badge tier indicators
- **THEN** it MAY use `weight="fill"` for achieved tiers and `weight="regular"` for unachieved
- **WHEN** rendering status indicator icons (CheckCircle, Warning, XCircle, WarningCircle, Info)
- **THEN** it MAY use `weight="fill"` or `weight="bold"` to preserve semantic emphasis

#### Scenario: No Emoji in Production UI (Reinforced)

- **WHEN** rendering any user-facing content in React components
- **THEN** the system MUST NOT display Unicode emoji characters as icons
- **AND** all icon needs MUST be fulfilled by Phosphor Icons from `Icon.tsx`
- **WHEN** writing console.log, console.warn, or console.error statements
- **THEN** emoji usage is PERMITTED for developer experience
- **WHEN** writing test mock implementations
- **THEN** emoji usage is PERMITTED for test readability

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
