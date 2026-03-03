/**
 * Segment button colors extracted from the original APK
 * (seg_shape_btn_new_home_*.xml)
 */
export interface SegmentButtonTheme {
  backgroundColor: string;
  color: string;
}

const PRIME_THEME: SegmentButtonTheme = {
  backgroundColor: "#034691",
  color: "#ffffff",
};

const DEFAULT_THEME: SegmentButtonTheme = {
  backgroundColor: "#ffffff",
  color: "#f31d5d",
};

export const SEGMENT_BUTTON_THEMES: Record<string, SegmentButtonTheme> = {
  EXCLUSIVE: DEFAULT_THEME,
  PRIME: PRIME_THEME,
  PRIVATE: DEFAULT_THEME,
  AFLUENTE: DEFAULT_THEME,
  VAREJO: DEFAULT_THEME,
  JOVEM: DEFAULT_THEME,
  UNIVERSITARIO: DEFAULT_THEME,
};

export function getSegmentButtonColor(segment?: string): string {
  const theme = segment && SEGMENT_BUTTON_THEMES[segment];
  return theme ? theme.color : DEFAULT_THEME.color;
}

/** Returns inline style for segment-colored buttons */
export function segmentButtonStyle(segment?: string): SegmentButtonTheme {
  const theme = segment && SEGMENT_BUTTON_THEMES[segment];
  return theme || DEFAULT_THEME;
}

const SEGMENT_ACCENT: Record<string, string> = {
  EXCLUSIVE: "#702f8a",
  PRIME: "#034691",
  PRIVATE: "#386079",
  AFLUENTE: "#cc092f",
  VAREJO: "#cc092f",
  JOVEM: "#cc092f",
  UNIVERSITARIO: "#cc092f",
};

/** Returns the accent color hex for a given segment */
export function getSegmentColor(segment?: string): string {
  return (segment && SEGMENT_ACCENT[segment]) || "#cc092f";
}
