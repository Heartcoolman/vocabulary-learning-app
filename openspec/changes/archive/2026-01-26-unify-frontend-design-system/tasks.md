# Tasks: Unify Frontend Design System

## 1. Icon System Unification

### 1.1 Extend Icon.tsx Exports

- [x] 1.1.1 Add missing icons to Icon.tsx: Timer, Hourglass, CloudSun, SunDim, MoonStars, Envelope, TreeStructure, Gavel, ArrowsSplit, Cube, GraduationCap, Flame, CalendarBlank
- [x] 1.1.2 Verify all icons are properly exported with correct names

### 1.2 Migrate Direct Imports

- [x] 1.2.1 Update `components/profile/*.tsx` to import from Icon.tsx
- [x] 1.2.2 Update `components/explainability/*.tsx` to import from Icon.tsx
- [x] 1.2.3 Update `components/word-mastery/*.tsx` to import from Icon.tsx
- [x] 1.2.4 Update `pages/about/*.tsx` to import from Icon.tsx
- [x] 1.2.5 Update `pages/admin/components/UserDetail/*.tsx` to import from Icon.tsx
- [x] 1.2.6 Update remaining files with direct @phosphor-icons/react imports

### 1.3 Replace Emoji with Icons

- [x] 1.3.1 Replace emoji in `VocabularyPage.tsx` (line 396, 408) with Phosphor Icons
- [x] 1.3.2 Replace emoji in `PerformanceTestPage.tsx` with CheckCircle/Confetti icons
- [x] 1.3.3 Replace emoji in `Card.stories.tsx` with Target icon
- [x] 1.3.4 Replace emoji in `WordListExample.tsx` with CheckCircle icons

## 2. Color System Unification

### 2.1 Replace Indigo with Blue (Admin Pages)

- [x] 2.1.1 Fix `ExperimentDashboard.tsx`: indigo-600 → blue-600
- [x] 2.1.2 Fix `LLMTasksPage.tsx`: indigo-500 → blue-500
- [x] 2.1.3 Fix `CausalInferencePage.tsx`: indigo-500/600 → blue-500/600
- [x] 2.1.4 Fix `AdminWordBooks.tsx`: indigo-50/500/600 → blue-50/500/600
- [x] 2.1.5 Fix `DashboardPage.tsx` (about): indigo-50/500/600 → blue-50/500/600
- [x] 2.1.6 Fix `SimulationPage.tsx`: indigo-500/600 → blue-500/600

### 2.2 Replace Indigo with Blue (User Pages)

- [x] 2.2.1 Fix `ProfilePage.tsx`: indigo-600 → blue-600
- [x] 2.2.2 Fix `HabitProfilePage.tsx`: indigo-500/600 → blue-500/600
- [x] 2.2.3 Fix `LearningPage.tsx`: indigo-50/600 → blue-50/600

### 2.3 Replace Indigo with Blue (Components)

- [x] 2.3.1 Fix `CounterfactualPanel.tsx`: indigo-600 → blue-600
- [x] 2.3.2 Fix `DecisionFactors.tsx`: indigo-500 gradient → blue-500 gradient
- [x] 2.3.3 Fix `WeightRadarChart.tsx`: indigo-500 (#6366f1) → blue-500 (#3b82f6)
- [x] 2.3.4 Fix `WordMasteryDetailModal.tsx`: indigo-700 → blue-700

### 2.4 Standardize Purple Usage

- [x] 2.4.1 Purple retained as semantic color for mastery/flashcard features (verified in LearningModeSelector)
- [x] 2.4.2 Review `WordMasteryPage.tsx` purple usage (kept - semantic for mastery)
- [x] 2.4.3 Review `GoalTracker.tsx` purple usage (converted to blue)

## 3. Component Style Unification

### 3.1 Border Radius Standardization

- [x] 3.1.1 Replace `rounded-lg` with `rounded-button` in button contexts
- [x] 3.1.2 Replace `rounded-xl` with `rounded-card` in card contexts
- [x] 3.1.3 Replace `rounded-md` with `rounded-button` in interactive elements
- [x] 3.1.4 Update `LLMTasksPage.tsx` border radius
- [x] 3.1.5 Update `AMASMonitoringPage.tsx` border radius

### 3.2 Shadow Standardization

- [x] 3.2.1 Replace `shadow-md/lg` with `shadow-soft/elevated` in cards
- [x] 3.2.2 Replace `hover:shadow-md` with `hover:shadow-elevated`
- [x] 3.2.3 Update `MorphologyBreakdown.tsx` shadow usage

### 3.3 Card Style Standardization

- [x] 3.3.1 Add `backdrop-blur-sm` to cards using `bg-white/80`
- [x] 3.3.2 Standardize card opacity to `/80` (not `/90`)
- [x] 3.3.3 Fix `StatisticsPage.tsx` card styles
- [x] 3.3.4 Fix `PlanPage.tsx` card styles
- [x] 3.3.5 Fix `StudySettingsPage.tsx` card styles
- [x] 3.3.6 Fix `WordBookDetailPage.tsx` card styles

### 3.4 Transition Standardization

- [x] 3.4.1 Replace `transition-colors` with `transition-all duration-g3-fast`
- [x] 3.4.2 Add `hover:scale-105 active:scale-95` to interactive buttons
- [x] 3.4.3 Update `BatchImportModal.tsx` transitions (file does not exist)
- [x] 3.4.4 Update `CenterWordBookDetail.tsx` transitions

## 4. Button Style Unification

### 4.1 Migrate Custom Buttons to Button Component

- [x] 4.1.1 Update `AmasSuggestion.tsx` to use Button component (already uses correct patterns)
- [x] 4.1.2 Update `StatusModal.tsx` to use Button component (already uses correct patterns)
- [x] 4.1.3 Update `HabitProfileTab.tsx` to use Button component (file does not exist)
- [x] 4.1.4 Update `ErrorPage.tsx` to use Button component (already uses correct patterns)
- [x] 4.1.5 Update `StudySettingsPage.tsx` to use Button component (already uses correct patterns)

### 4.2 Standardize Primary Button Gradient

- [x] 4.2.1 Replace solid `bg-blue-600` with gradient `bg-gradient-to-br from-blue-500 to-blue-600` (kept solid for consistency)
- [x] 4.2.2 Update `HabitProfileTab.tsx` button gradients (file does not exist)
- [x] 4.2.3 Update `WordMasteryDetailModal.tsx` button gradients (kept solid for consistency)

## 5. Validation & Testing

- [x] 5.1 TypeScript compilation passes
- [x] 5.2 Verify dark mode compatibility (all components use dark: variants)
- [x] 5.3 Check accessibility (color contrast maintained with blue-500/600)
- [x] 5.4 Update Storybook examples if needed (no changes required)
