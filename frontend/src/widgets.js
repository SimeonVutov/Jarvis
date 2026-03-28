// Widget Registry — defines every available widget for the Home page.
// Loaded before all JSX (plain JS, no Babel) so globals are available.
// To add a new widget:
//   1. Add an entry here in WIDGET_REGISTRY
//   2. Add the React component in Widgets.jsx
//   3. Register it in WIDGET_COMPONENTS at the bottom of Widgets.jsx

const WIDGET_REGISTRY = [
  {
    id: "greeting",
    name: "Daily Greeting",
    description: "AI-powered personalised greeting with today's weather and fitness status",
    icon: "◈",
    app: null,                   // null = always available regardless of enabled apps
    defaultCols: 12, defaultRows: 1,
    sizes: [
      { cols: 12, rows: 1, label: "Full-width" },
      { cols: 8,  rows: 1, label: "Wide" },
      { cols: 12, rows: 2, label: "Full-width tall" },
    ],
  },
  {
    id: "weather",
    name: "Weather",
    description: "Current conditions, feels-like, and hourly forecast",
    icon: "☁️",
    app: null,
    defaultCols: 4, defaultRows: 2,
    sizes: [
      { cols: 3, rows: 1, label: "Mini" },
      { cols: 3, rows: 2, label: "Compact" },
      { cols: 4, rows: 2, label: "Standard" },
      { cols: 6, rows: 2, label: "Wide" },
    ],
  },
  {
    id: "fitness-today",
    name: "Fitness Today",
    description: "Today's calories, weight, and workout with inline log form",
    icon: "🏋️",
    app: "fitness",
    defaultCols: 4, defaultRows: 1,
    sizes: [
      { cols: 3, rows: 1, label: "Mini" },
      { cols: 4, rows: 1, label: "Standard" },
      { cols: 6, rows: 1, label: "Wide" },
      { cols: 4, rows: 2, label: "With log form" },
      { cols: 6, rows: 2, label: "Wide + log form" },
    ],
  },
  {
    id: "fitness-chart",
    name: "Fitness Chart",
    description: "7-day calorie and weight trend chart",
    icon: "📈",
    app: "fitness",
    defaultCols: 6, defaultRows: 2,
    sizes: [
      { cols: 6,  rows: 2, label: "Standard" },
      { cols: 8,  rows: 2, label: "Wide" },
      { cols: 12, rows: 2, label: "Full-width" },
      { cols: 6,  rows: 3, label: "Tall" },
    ],
  },
  {
    id: "reminders",
    name: "Reminders",
    description: "Upcoming reminders with one-click done",
    icon: "📋",
    app: "remind",
    defaultCols: 4, defaultRows: 2,
    sizes: [
      { cols: 3, rows: 1, label: "Next only" },
      { cols: 3, rows: 2, label: "Compact" },
      { cols: 4, rows: 2, label: "Standard" },
      { cols: 6, rows: 2, label: "Wide" },
    ],
  },
  {
    id: "calendar-today",
    name: "Today's Schedule",
    description: "Tasks and events for today with done toggle",
    icon: "◰",
    app: "calendar",
    defaultCols: 4, defaultRows: 2,
    sizes: [
      { cols: 3, rows: 2, label: "Compact" },
      { cols: 4, rows: 2, label: "Standard" },
      { cols: 6, rows: 2, label: "Wide" },
      { cols: 4, rows: 3, label: "Tall" },
    ],
  },
  {
    id: "news-headlines",
    name: "News Headlines",
    description: "Latest headlines from your configured RSS sources",
    icon: "◉",
    app: "news",
    defaultCols: 6, defaultRows: 2,
    sizes: [
      { cols: 4, rows: 1, label: "Ticker" },
      { cols: 4, rows: 2, label: "Compact" },
      { cols: 6, rows: 2, label: "Standard" },
      { cols: 8, rows: 2, label: "Wide" },
    ],
  },
  {
    id: "journal",
    name: "Journal",
    description: "Write personal notes and see recent entries",
    icon: "◩",
    app: "journal",
    defaultCols: 6, defaultRows: 3,
    sizes: [
      { cols: 4, rows: 2, label: "Compact" },
      { cols: 6, rows: 2, label: "Write only" },
      { cols: 4, rows: 3, label: "Standard compact" },
      { cols: 6, rows: 3, label: "Standard" },
      { cols: 8, rows: 3, label: "Wide" },
    ],
  },
  {
    id: "quick-stats",
    name: "Quick Stats",
    description: "Session, message, and memory counts at a glance",
    icon: "◷",
    app: null,
    defaultCols: 4, defaultRows: 1,
    sizes: [
      { cols: 3, rows: 1, label: "Compact" },
      { cols: 4, rows: 1, label: "Standard" },
      { cols: 6, rows: 1, label: "Wide" },
    ],
  },
];

// Default layout shown on first visit (before any customisation)
const DEFAULT_LAYOUT = [
  { instanceId: "default-greeting",  widgetId: "greeting",       cols: 12, rows: 1 },
  { instanceId: "default-weather",   widgetId: "weather",        cols: 4,  rows: 2 },
  { instanceId: "default-remind",    widgetId: "reminders",      cols: 4,  rows: 2 },
  { instanceId: "default-calendar",  widgetId: "calendar-today", cols: 4,  rows: 2 },
];
