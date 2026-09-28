/** Natural file-name order ("page 2" before "page 10"), then upload time: the order pages are read in. */
const collator = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' });

export function orderMaterials<T extends { fileName: string; uploadedAt: number }>(materials: T[]): T[] {
  return [...materials].sort((a, b) => collator.compare(a.fileName, b.fileName) || a.uploadedAt - b.uploadedAt);
}

/** The last part of a transcription, given as context to the next part of the same document. */
export function tailContext(markdown: string, maxChars = 3000): string {
  if (markdown.length <= maxChars) return markdown;
  const cut = markdown.slice(-maxChars);
  const para = cut.indexOf('\n\n');
  return para > 0 && para < maxChars / 2 ? cut.slice(para + 2) : cut;
}
