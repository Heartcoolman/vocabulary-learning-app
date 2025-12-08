// Root-level components
export { default as WordCard } from './WordCard';
export { default as TestOptions } from './TestOptions';
export { default as Navigation } from './Navigation';
export { default as ProtectedRoute } from './ProtectedRoute';
export { default as SyncIndicator } from './SyncIndicator';
export { default as AmasStatus } from './AmasStatus';
export { default as AmasSuggestion } from './AmasSuggestion';
export { default as FileUpload } from './FileUpload';
export { default as StatusModal } from './StatusModal';
export { default as SuggestionModal } from './SuggestionModal';
export { default as BatchImportModal } from './BatchImportModal';
export { default as ProgressBarChart } from './ProgressBarChart';
export { default as LineChart } from './LineChart';
export { default as ChronotypeCard } from './ChronotypeCard';
export { DecisionTooltip } from './DecisionTooltip';
export { default as LearningStyleCard } from './LearningStyleCard';
export { default as MasteryProgress } from './MasteryProgress';
export { LearningModeSelector } from './LearningModeSelector';
export { default as BadgeCelebration } from './BadgeCelebration';
// Icon - 重新导出图标，使用 export * from './Icon' 或直接从 './Icon' 导入
// 注意：排除 List，因为 ui/List 也导出了 List 组件
export {
  ChartBar,
  ChartLine,
  ChartPie,
  Target,
  Eye,
  Pulse,
  Globe,
  Check,
  CheckCircle,
  X,
  XCircle,
  Warning,
  Clock,
  TrendUp,
  TrendDown,
  Star,
  Hash,
  BookOpen,
  MagnifyingGlass,
  CircleNotch,
  Books,
  File,
  Trash,
  SpeakerHigh,
  Note,
  ChatText,
  Plus,
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  ArrowCounterClockwise,
  ListNumbers,
  Confetti,
  UsersThree,
  FileText,
  Sparkle,
  Gear,
  FloppyDisk,
  CaretLeft,
  CaretRight,
  CaretDown,
  User,
  Fire,
  SortAscending,
  SortDescending,
  Flag,
  Lock,
  Coffee,
  Lightbulb,
  PushPin,
  Question,
  Compass,
  Headphones,
  Hand,
  SunHorizon,
  Sun,
  Moon,
  Trophy,
  Medal,
  Crown,
  Lightning,
  Brain,
  Calendar,
  CalendarCheck,
  Percent,
  Timer,
  ArrowUp,
  ArrowDown,
  Minus,
  Info,
  Play,
  Pause,
  CaretUp,
  SlidersHorizontal,
  SignIn,
  Cpu,
  Graph,
  Atom,
  Robot,
  Shuffle,
  Flask,
  ShareNetwork,
  GitBranch,
  IdentificationBadge,
  WarningCircle,
  Database,
  UserCircle,
  Bell,
  Pencil,
  Bug,
  Funnel,
  Desktop,
  DeviceMobile,
  UploadSimple,
  NotePencil,
  ArrowsClockwise,
  Scales,
  DownloadSimple,
  PencilSimple,
  DotsThreeVertical,
  ShieldCheck,
  WifiHigh,
  WifiSlash,
  Sliders,
  UserFocus,
  Activity,
  Users,
  Gauge,
  ToggleLeft,
  ToggleRight,
  Shield,
} from './Icon';
// 导出 Icon 中的 List 作为 IconList，避免与 ui/List 冲突
export { List as IconList } from './Icon';

// Re-export from sub-directories
export * from './ui';
export * from './progress';
export * from './profile';
export * from './dashboard';
export * from './explainability';
export * from './word-mastery';
export * from './admin';
export * from './badges';
