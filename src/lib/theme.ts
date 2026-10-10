/** Light / dark preference, kept in a cookie so the server renders the right theme (no flash). */
export const THEME_COOKIE = "theme";
export type Theme = "light" | "dark";
/** Default: the carbon (dark) look. */
export const parseTheme = (value: string | undefined): Theme => (value === "light" ? "light" : "dark");
