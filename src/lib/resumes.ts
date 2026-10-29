// Résumé files: PDF or Word (.docx), up to 5 MB, at resumes/<user id>/<random id>.<ext>.

export const RESUME_MAX = 5 * 1024 * 1024;
export const PDF = "application/pdf";
export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export type ResumeType = typeof PDF | typeof DOCX;
export const RESUME_TYPES: Record<ResumeType, string> = { [PDF]: "PDF", [DOCX]: "Word" };
export const RESUME_EXT: Record<ResumeType, string> = { [PDF]: "pdf", [DOCX]: "docx" };

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);
function contains(b: Uint8Array, needle: number[]) {
  outer: for (let i = 0; i <= b.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (b[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

// What the file really is, from its bytes. A Word file is a zip whose file list names word/document.xml;
// any other zip, or a renamed file, is null.
export function sniffResume(b: Uint8Array): ResumeType | null {
  if (startsWith(b, ascii("%PDF-"))) return PDF;
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) && contains(b, ascii("[Content_Types].xml")) && contains(b, ascii("word/document.xml"))) return DOCX;
  return null;
}

// Only a path the browser could have made for this person: their folder, a random id, a known ending.
export function isResumePath(path: string, userId: string) {
  return new RegExp(`^${userId}/[0-9a-f-]{36}\\.(pdf|docx)$`).test(path);
}

// "Hoa Nguyen CV (2026).pdf" -> "Hoa Nguyen CV (2026)"
export function resumeName(fileName: string) {
  const name = fileName.replace(/\.(pdf|docx)$/i, "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
  return name || "Résumé";
}

export function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
