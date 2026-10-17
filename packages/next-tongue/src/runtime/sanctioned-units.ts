/**
 * ECMA-402 sanctioned simple units (Intl.NumberFormat `style: "unit"`).
 * @see https://tc39.es/ecma402/#table-sanctioned-single-unit-identifiers
 */
export const SIMPLE_UNITS = [
  'acre',
  'bit',
  'byte',
  'celsius',
  'centimeter',
  'day',
  'degree',
  'fahrenheit',
  'fluid-ounce',
  'foot',
  'gallon',
  'gigabit',
  'gigabyte',
  'gram',
  'hectare',
  'hour',
  'inch',
  'kilobit',
  'kilobyte',
  'kilogram',
  'kilometer',
  'liter',
  'megabit',
  'megabyte',
  'meter',
  'microsecond',
  'mile',
  'mile-scandinavian',
  'milliliter',
  'millimeter',
  'millisecond',
  'minute',
  'month',
  'nanosecond',
  'ounce',
  'percent',
  'petabyte',
  'pound',
  'second',
  'stone',
  'terabyte',
  'week',
  'yard',
  'year',
] as const;

export type SimpleUnit = (typeof SIMPLE_UNITS)[number];

/** Simple unit or `a-per-b` compound (e.g. `kilometer-per-hour`). */
export type SanctionedUnit = SimpleUnit | `${SimpleUnit}-per-${SimpleUnit}`;

const simpleSet = new Set<string>(SIMPLE_UNITS);

/** Runtime check for untyped boundaries (CMS strings, etc.). */
export function isSanctionedUnit(unit: string): unit is SanctionedUnit {
  if (simpleSet.has(unit)) return true;
  const i = unit.indexOf('-per-');
  if (i <= 0) return false;
  const a = unit.slice(0, i);
  const b = unit.slice(i + '-per-'.length);
  return simpleSet.has(a) && simpleSet.has(b);
}
