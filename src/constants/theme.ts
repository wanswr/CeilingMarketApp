export const COLORS = {
  // BAQZ Core Brand Colors
  primary: '#0F172A',         // Primary Navy Dark
  accent: '#BEF264',          // Lime Accent
  secondary: '#BEF264',       // Lime Secondary Accent
  background: '#F8FAFC',      // Main App Background
  bgLight: '#F8FAFC',         // Background Light Alias
  surface: '#FFFFFF',         // Cards / Modals Surface
  surfaceVariant: '#F1F5F9',  // Secondary Surface Area
  outline: '#64748B',         // Secondary Icons / Text
  outlineVariant: '#CBD5E1',  // Borders / Dividers
  primaryContainer: '#1E293B',// Dark Container Variant
  secondaryContainer: '#D9F99D',// Soft Lime Container

  // Functional Colors
  success: '#10B981',         // Fresh Emerald Success
  danger: '#EF4444',          // Clear Red Danger
  warning: '#F59E0B',         // Warm Amber Warning
  info: '#3B82F6',            // Clean Blue Info
  light: '#F8FAFC',           // Light Surface
  dark: '#0F172A',            // Deep Navy Text
  gray: '#64748B',            // Secondary Gray Text
  white: '#FFFFFF',           // Pure White
  border: '#CBD5E1',          // Outline Variant Border
  placeholder: '#64748B',      // Input Placeholder
  cardBg: '#FFFFFF',          // Clean Surface Card Background
};

export const TYPOGRAPHY = {
  fontFamily: 'Montserrat',
  sizes: {
    hero: 40,
    h1: 32,
    h2: 24,
    h3: 20,
    body: 16,
    bodySmall: 14,
    caption: 12,
  },
  weights: {
    regular: '400' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },
};

export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const GRADIENTS = {
  header: ['#0F172A', '#1E293B'],
  button: ['#0F172A', '#1E293B'],
  accent: ['#BEF264', '#D9F99D'],
  success: ['#10B981', '#059669'],
  card: ['#FFFFFF', '#F1F5F9'],
};

export const SHADOWS = {
  soft: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  heavy: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
