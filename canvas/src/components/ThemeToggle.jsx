import { Droplet, Leaf, Moon, Sun } from 'lucide-react';
import { strings } from '../content/strings.js';
import { useTheme } from '../hooks/useTheme.js';

const THEME_TOGGLE = {
  light: {
    label: strings.theme.switchToDark,
    Icon: Moon,
  },
  dark: {
    label: strings.theme.switchToGreen,
    Icon: Leaf,
  },
  green: {
    label: strings.theme.switchToBlue,
    Icon: Droplet,
  },
  blue: {
    label: strings.theme.switchToLight,
    Icon: Sun,
  },
};

export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const { label, Icon } = THEME_TOGGLE[theme] ?? THEME_TOGGLE.light;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={label}
      aria-label={label}
      className="sans p-1 text-muted hover:text-secondary transition rounded-md hover:bg-surface-muted/80"
    >
      <Icon size={15} strokeWidth={1.5} />
    </button>
  );
}
