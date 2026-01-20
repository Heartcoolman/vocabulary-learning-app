Based on the analysis of the codebase, I have identified that the project already has a comprehensive "G3 Design System" defined in `DESIGN_SYSTEM.md` and implemented in `index.css` (Tailwind config). However, some pages like `LoginPage.tsx` are still using raw HTML elements and standard Tailwind classes instead of the reusable UI components and advanced visual effects (like Glassmorphism) defined in the system.

My plan is to "beautify" the project by fully adopting this design system in the Authentication pages, which are the entry points of the application.

### 1. Global Visual Polish

- **Custom Scrollbars**: Add modern, slim scrollbar styles to `index.css` that match the theme.
- **Selection Color**: Customize the text selection highlight color to match the brand's primary blue.

### 2. Beautify Login Page (`LoginPage.tsx`)

- **Component Adoption**: Replace raw `<input>` and `<button>` elements with the reusable `components/ui/Input` and `components/ui/Button` components to ensure consistency.
- **Glassmorphism**: Upgrade the login card to use the `.card-glass` style for a modern, translucent look.
- **Animated Background**: Add a subtle animated gradient background to the page to replace the plain gray background, making it feel more alive.
- **Typography & Spacing**: Refine the typography using the design system's text tokens (e.g., `text-heading`, `text-caption`).

### 3. Beautify Register Page (`RegisterPage.tsx`)

- Apply the same treatments as the Login Page to ensure a consistent user experience.
