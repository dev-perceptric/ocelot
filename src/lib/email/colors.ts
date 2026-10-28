// Email clients ignore CSS variables, so emails carry the brand colors as plain values.
// They must match the tokens in src/app/globals.css (checked by tests/email.test.ts).
export const EMAIL_COLORS = {
  brand: "#FFE100",
  ink: "#1A1A1A",
  surface: "#FFFFFF",
  canvas: "#F2F3F4",
  muted: "#595959",
  border: "#D3D5D7",
} as const;
