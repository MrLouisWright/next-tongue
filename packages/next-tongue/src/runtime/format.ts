export type FormatOptions = {
  locale: string;
  timeZone: string;
  numberPresets?: Record<string, Intl.NumberFormatOptions>;
  dateTimePresets?: Record<string, Intl.DateTimeFormatOptions>;
};

export type Format = {
  number: (
    value: number | bigint,
    presetOrOptions?: string | Intl.NumberFormatOptions,
  ) => string;
  dateTime: (
    value: Date | number,
    presetOrOptions?: string | Intl.DateTimeFormatOptions,
  ) => string;
  relativeTime: (
    value: Date | number,
    now: Date | number,
    options?: Intl.RelativeTimeFormatOptions & {
      unit?: Intl.RelativeTimeFormatUnit;
    },
  ) => string;
  list: (items: readonly string[], options?: Intl.ListFormatOptions) => string;
  unit: (
    value: number,
    unit: string,
    options?: { unitDisplay?: 'short' | 'long' | 'narrow' },
  ) => string;
  displayName: (
    code: string,
    options: {
      type: 'language' | 'region' | 'script' | 'currency' | 'calendar';
    },
  ) => string;
};

const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();
const relCache = new Map<string, Intl.RelativeTimeFormat>();
const listCache = new Map<string, Intl.ListFormat>();
const displayCache = new Map<string, Intl.DisplayNames>();

function cacheKey(parts: unknown[]): string {
  return JSON.stringify(parts);
}

export function createFormat(opts: FormatOptions): Format {
  const { locale, timeZone } = opts;

  return {
    number(value, presetOrOptions) {
      const options =
        typeof presetOrOptions === 'string'
          ? (opts.numberPresets?.[presetOrOptions] ?? {})
          : (presetOrOptions ?? {});
      const key = cacheKey(['n', locale, options]);
      let fmt = numberCache.get(key);
      if (!fmt) {
        fmt = new Intl.NumberFormat(locale, options);
        numberCache.set(key, fmt);
      }
      return fmt.format(value);
    },

    dateTime(value, presetOrOptions) {
      const options =
        typeof presetOrOptions === 'string'
          ? { timeZone, ...(opts.dateTimePresets?.[presetOrOptions] ?? {}) }
          : { timeZone, ...(presetOrOptions ?? {}) };
      const key = cacheKey(['d', locale, options]);
      let fmt = dateCache.get(key);
      if (!fmt) {
        fmt = new Intl.DateTimeFormat(locale, options);
        dateCache.set(key, fmt);
      }
      return fmt.format(value);
    },

    relativeTime(value, now, options = {}) {
      const v = typeof value === 'number' ? value : value.getTime();
      const n = typeof now === 'number' ? now : now.getTime();
      const diffSec = Math.round((v - n) / 1000);
      const unit = options.unit ?? pickUnit(diffSec);
      const amount = unitAmount(diffSec, unit);
      const { unit: _, ...rtfOpts } = options;
      void _;
      const key = cacheKey(['r', locale, rtfOpts]);
      let fmt = relCache.get(key);
      if (!fmt) {
        fmt = new Intl.RelativeTimeFormat(locale, rtfOpts);
        relCache.set(key, fmt);
      }
      return fmt.format(amount, unit);
    },

    list(items, options) {
      const key = cacheKey(['l', locale, options ?? {}]);
      let fmt = listCache.get(key);
      if (!fmt) {
        fmt = new Intl.ListFormat(locale, options);
        listCache.set(key, fmt);
      }
      return fmt.format(items);
    },

    unit(value, unit, options) {
      return new Intl.NumberFormat(locale, {
        style: 'unit',
        unit,
        unitDisplay: options?.unitDisplay ?? 'short',
      }).format(value);
    },

    displayName(code, options) {
      const key = cacheKey(['dn', locale, options]);
      let fmt = displayCache.get(key);
      if (!fmt) {
        fmt = new Intl.DisplayNames(locale, options);
        displayCache.set(key, fmt);
      }
      return fmt.of(code) ?? code;
    },
  };
}

function pickUnit(diffSec: number): Intl.RelativeTimeFormatUnit {
  const abs = Math.abs(diffSec);
  if (abs < 60) return 'second';
  if (abs < 3600) return 'minute';
  if (abs < 86400) return 'hour';
  if (abs < 604800) return 'day';
  if (abs < 2629800) return 'week';
  if (abs < 31557600) return 'month';
  return 'year';
}

function unitAmount(diffSec: number, unit: Intl.RelativeTimeFormatUnit): number {
  const div: Record<string, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2629800,
    year: 31557600,
  };
  return Math.round(diffSec / (div[unit] ?? 1));
}
