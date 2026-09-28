import { describe, expect, it } from 'vitest';
import { orderMaterials, tailContext } from '../../functions/src/testmaker/order';

describe('orderMaterials', () => {
  it('reads pages in natural order, then by upload time', () => {
    const m = (fileName: string, uploadedAt = 0) => ({ fileName, uploadedAt });
    const ordered = orderMaterials([m('pagina 10.jpg'), m('Pagina 2.jpg'), m('pagina 1.jpg'), m('scan.pdf', 2), m('scan.pdf', 1)]);
    expect(ordered.map((x) => `${x.fileName}@${x.uploadedAt}`)).toEqual([
      'pagina 1.jpg@0',
      'Pagina 2.jpg@0',
      'pagina 10.jpg@0',
      'scan.pdf@1',
      'scan.pdf@2',
    ]);
  });
});

describe('tailContext', () => {
  it('returns short text unchanged', () => {
    expect(tailContext('abc', 10)).toBe('abc');
  });
  it('keeps the end, starting at a paragraph boundary when possible', () => {
    const text = `${'x'.repeat(50)}\n\nSecond paragraph that continues`;
    expect(tailContext(text, 40)).toBe('Second paragraph that continues');
  });
});
