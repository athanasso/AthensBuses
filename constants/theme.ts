/**
 * OASA Telematics App Theme
 * Dark theme with purple accent color
 */

import { Platform } from 'react-native';

// Purple accent color matching the reference design
const accentColor = '#8B5CF6';
const accentColorLight = '#A78BFA';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#687076',
    background: '#fff',
    backgroundSecondary: '#f5f5f5',
    tint: accentColor,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: accentColor,
    card: '#fff',
    border: '#e5e5e5',
    accent: accentColor,
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#9BA1A6',
    background: '#0a0a0a',
    backgroundSecondary: '#1a1a1a',
    tint: accentColorLight,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: accentColor,
    card: '#1a1a1a',
    border: '#2a2a2a',
    accent: accentColor,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
