export function formatEvidenceItem(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = [record.title, record.snippet, record.url]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    if (parts.length) return parts.join(" · ");
    try {
      return JSON.stringify(value);
    } catch {
      return "无法解析的证据记录";
    }
  }

  return String(value);
}

export function formatEvidenceList(value: unknown) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.map(formatEvidenceItem).filter(Boolean);
}
