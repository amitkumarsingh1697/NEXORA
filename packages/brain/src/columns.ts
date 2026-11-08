import type { BrainColumn } from './model';

/** `varchar(255)`, `numeric(12, 2)`: a column type with its size, as written in the schema. */
export function columnTypeText(
  c: Pick<BrainColumn, 'type' | 'length' | 'precision' | 'scale'>,
): string {
  const size =
    c.precision !== undefined
      ? `(${c.precision}${c.scale !== undefined ? `, ${c.scale}` : ''})`
      : c.length !== undefined
        ? `(${c.length})`
        : '';
  return `${c.type}${size}`;
}
