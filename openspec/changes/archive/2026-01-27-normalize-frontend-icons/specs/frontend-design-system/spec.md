# frontend-design-system Specification Delta

## MODIFIED Requirements

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
