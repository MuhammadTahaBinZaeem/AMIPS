export interface SelectionRange {
  start: number;
  end: number;
}

export interface FindReplaceResult {
  content: string;
  selection: SelectionRange;
}

export function findNext(content: string, pattern: string, fromIndex: number): SelectionRange | null {
  if (!pattern) return null;

  const location = content.indexOf(pattern, fromIndex);
  if (location === -1) return null;

  return { start: location, end: location + pattern.length };
}

export function replace(
  content: string,
  selection: SelectionRange,
  pattern: string,
  replacement: string,
): FindReplaceResult {
  if (!pattern) return { content, selection };

  const matchesSelection =
    selection.start >= 0 &&
    selection.end <= content.length &&
    content.slice(selection.start, selection.end) === pattern;

  if (matchesSelection) {
    const updated =
      content.slice(0, selection.start) + replacement + content.slice(selection.end, content.length);
    const nextSelectionStart = selection.start + replacement.length;
    return { content: updated, selection: { start: nextSelectionStart, end: nextSelectionStart } };
  }

  const next = findNext(content, pattern, selection.end);
  if (!next) return { content, selection };

  const updated = content.slice(0, next.start) + replacement + content.slice(next.end);
  const cursor = next.start + replacement.length;
  return { content: updated, selection: { start: cursor, end: cursor } };
}

export function replaceAll(content: string, pattern: string, replacement: string): FindReplaceResult {
  if (!pattern) return { content, selection: { start: 0, end: 0 } };

  let cursor = 0;
  const parts: string[] = [];
  let match = content.indexOf(pattern, cursor);

  while (match !== -1) {
    parts.push(content.slice(cursor, match));
    parts.push(replacement);
    cursor = match + pattern.length;
    match = content.indexOf(pattern, cursor);
  }

  parts.push(content.slice(cursor));
  const combined = parts.join("");
  const end = combined.length;
  return { content: combined, selection: { start: end, end: end } };
}
