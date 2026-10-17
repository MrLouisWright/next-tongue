/**
 * Dev-only overlay registry. Tree-shaken from production when the overlay
 * import graph is eliminated via `process.env.NODE_ENV === 'development'`.
 */

export type DevLoadedKey = {
  namespace: string;
  key: string;
  fullKey: string;
};

export type DevMissingKey = {
  fullKey: string;
  locale: string;
};

export type DevFallbackKey = {
  fullKey: string;
  locale: string;
  from: string;
};

export type DevEscape = {
  namespace: string;
  file: string;
};

export type DevRendered = {
  fullKey: string;
  text: string;
  src?: string;
};

type Snapshot = {
  loaded: DevLoadedKey[];
  missing: DevMissingKey[];
  fallbacks: DevFallbackKey[];
  escapes: DevEscape[];
  rendered: DevRendered[];
};

type Listener = () => void;

const g = globalThis as typeof globalThis & {
  __nextTongueDev?: {
    loaded: Map<string, DevLoadedKey>;
    missing: Map<string, DevMissingKey>;
    fallbacks: Map<string, DevFallbackKey>;
    escapes: Map<string, DevEscape>;
    rendered: DevRendered[];
    listeners: Set<Listener>;
    /** Cached for useSyncExternalStore getServerSnapshot — same ref until notify(). */
    snapshot: Snapshot | null;
  };
};

function store() {
  if (!g.__nextTongueDev) {
    g.__nextTongueDev = {
      loaded: new Map(),
      missing: new Map(),
      fallbacks: new Map(),
      escapes: new Map(),
      rendered: [],
      listeners: new Set(),
      snapshot: null,
    };
  }
  return g.__nextTongueDev;
}

function notify() {
  const s = store();
  s.snapshot = null;
  for (const l of s.listeners) l();
}

export function tongueDevLoaded(namespace: string, key: string): void {
  const fullKey = namespace === '_root' || namespace === '' ? key : `${namespace}.${key}`;
  const ns = namespace || '_root';
  store().loaded.set(fullKey, { namespace: ns, key, fullKey });
  notify();
}

type DevGlobals = typeof globalThis & {
  __tongueDevReport?: (e: {
    fullKey: string;
    locale: string;
    text: string;
    src?: string;
    fallbackFrom?: string;
    missing?: boolean;
  }) => void;
  __tongueDevLoaded?: (namespace: string, key: string) => void;
  __tongueDevEscape?: (namespace: string, file: string) => void;
};

/** Wire createT + call-site loader hooks without import cycles. */
export function installTongueDevReporter(): void {
  const gThis = globalThis as DevGlobals;
  gThis.__tongueDevReport = (e) => {
    if (e.missing) {
      tongueDevMissing(e.fullKey, e.locale);
      return;
    }
    tongueDevRendered({
      fullKey: e.fullKey,
      text: e.text,
      ...(e.src ? { src: e.src } : {}),
    });
    if (e.fallbackFrom) {
      tongueDevFallback(e.fullKey, e.locale, e.fallbackFrom);
    }
  };
  gThis.__tongueDevLoaded = tongueDevLoaded;
  gThis.__tongueDevEscape = tongueDevEscape;
}

export function tongueDevMissing(fullKey: string, locale: string): void {
  store().missing.set(`${locale}:${fullKey}`, { fullKey, locale });
  notify();
}

export function tongueDevFallback(
  fullKey: string,
  locale: string,
  from: string,
): void {
  store().fallbacks.set(`${locale}:${fullKey}`, { fullKey, locale, from });
  notify();
}

export function tongueDevEscape(namespace: string, file: string): void {
  store().escapes.set(`${namespace}:${file}`, { namespace, file });
  notify();
}

export function tongueDevRendered(entry: DevRendered): void {
  const s = store();
  // Cap to keep memory bounded on hot pages.
  if (s.rendered.length > 500) s.rendered.shift();
  s.rendered.push(entry);
  notify();
}

export function subscribeTongueDev(listener: Listener): () => void {
  store().listeners.add(listener);
  return () => {
    store().listeners.delete(listener);
  };
}

export function getTongueDevSnapshot(): Snapshot {
  const s = store();
  if (s.snapshot) return s.snapshot;
  s.snapshot = {
    loaded: [...s.loaded.values()],
    missing: [...s.missing.values()],
    fallbacks: [...s.fallbacks.values()],
    escapes: [...s.escapes.values()],
    rendered: [...s.rendered],
  };
  return s.snapshot;
}

/** @internal test helper */
export function __resetTongueDev(): void {
  delete g.__nextTongueDev;
}

export function lookupRenderedByText(text: string): DevRendered | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const list = store().rendered;
  for (let i = list.length - 1; i >= 0; i--) {
    const row = list[i]!;
    if (row.text === trimmed || row.text.includes(trimmed) || trimmed.includes(row.text)) {
      return row;
    }
  }
  return undefined;
}
