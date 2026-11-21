// Database rules raise plain-language messages; pass those through, hide anything else.
export const say = (e: { message: string } | null, fallback: string) =>
  e && /^[A-Z][^\n]{8,160}$/.test(e.message) && !/violates|permission|relation|column|syntax/i.test(e.message) ? e.message : fallback;
