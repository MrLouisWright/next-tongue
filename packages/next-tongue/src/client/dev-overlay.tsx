'use client';

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  getTongueDevSnapshot,
  lookupRenderedByText,
  subscribeTongueDev,
} from './dev-registry.js';
import { buildEditorUrl, parseSourceRef } from './editor-url.js';

export type DevOverlayProps = {
  locale: string;
  timeZone: string;
  /** Preset or template; overridden by `TONGUE_EDITOR`. */
  editor?: string;
};

const panelStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 2147483646,
  right: 12,
  bottom: 12,
  width: 360,
  maxHeight: '70vh',
  overflow: 'auto',
  margin: 0,
  padding: 12,
  border: '1px solid #333',
  borderRadius: 8,
  background: '#111',
  color: '#eee',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.45,
  boxShadow: '0 8px 24px rgba(0,0,0,.45)',
};

const btnStyle: CSSProperties = {
  appearance: 'none',
  border: '1px solid #555',
  background: '#222',
  color: '#eee',
  borderRadius: 4,
  padding: '2px 8px',
  cursor: 'pointer',
  font: 'inherit',
};

function useDevSnapshot() {
  return useSyncExternalStore(
    subscribeTongueDev,
    getTongueDevSnapshot,
    getTongueDevSnapshot,
  );
}

/**
 * Dev-only tongue overlay. Mounted only when `NODE_ENV === 'development'`.
 * Toggle with Alt+Shift+T.
 */
export function DevOverlay({
  locale,
  timeZone,
  editor = 'vscode',
}: DevOverlayProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [picked, setPicked] = useState<{
    fullKey: string;
    src?: string;
  } | null>(null);
  const snap = useDevSnapshot();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openInEditor = useCallback(
    (src: string | undefined) => {
      const ref = parseSourceRef(src);
      if (!ref) return;
      const url = buildEditorUrl(ref.file, ref.line, editor);
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [editor],
  );

  useEffect(() => {
    if (!open || !inspect) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-tongue-overlay]')) return;
      const attrKey = target.closest('[data-tongue-key]') as HTMLElement | null;
      if (attrKey?.dataset.tongueKey) {
        e.preventDefault();
        e.stopPropagation();
        setPicked({
          fullKey: attrKey.dataset.tongueKey,
          ...(attrKey.dataset.tongueSrc
            ? { src: attrKey.dataset.tongueSrc }
            : {}),
        });
        return;
      }
      const text = (target.textContent ?? '').trim();
      const hit = lookupRenderedByText(text);
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        setPicked({
          fullKey: hit.fullKey,
          ...(hit.src ? { src: hit.src } : {}),
        });
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [open, inspect]);

  if (!open) return null;

  return (
    <aside
      data-tongue-overlay=""
      role="complementary"
      aria-label="next-tongue dev overlay"
      style={panelStyle}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <strong>next-tongue</strong>
        <span>
          <button
            type="button"
            style={btnStyle}
            aria-pressed={inspect}
            onClick={() => setInspect((v) => !v)}
          >
            {inspect ? 'Inspect on' : 'Inspect'}
          </button>{' '}
          <button type="button" style={btnStyle} onClick={() => setOpen(false)}>
            Close
          </button>
        </span>
      </header>
      <p style={{ margin: '0 0 8px' }}>
        locale <code>{locale}</code> · timeZone <code>{timeZone}</code>
        <br />
        <span style={{ opacity: 0.7 }}>Alt+Shift+T to toggle</span>
      </p>

      {picked ? (
        <section style={{ marginBottom: 10 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 12 }}>Picked</h3>
          <code>{picked.fullKey}</code>
          {picked.src ? (
            <div>
              <button
                type="button"
                style={{ ...btnStyle, marginTop: 4 }}
                onClick={() => openInEditor(picked.src)}
              >
                Open {picked.src}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <Section title={`Missing (${snap.missing.length})`}>
        {snap.missing.length === 0 ? (
          <Empty />
        ) : (
          <ul style={listStyle}>
            {snap.missing.map((m) => (
              <li key={`${m.locale}:${m.fullKey}`}>
                <code>{m.fullKey}</code> @{m.locale}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Fallbacks (${snap.fallbacks.length})`}>
        {snap.fallbacks.length === 0 ? (
          <Empty />
        ) : (
          <ul style={listStyle}>
            {snap.fallbacks.map((f) => (
              <li key={`${f.locale}:${f.fullKey}`}>
                <code>{f.fullKey}</code> {f.locale}←{f.from}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Client keys (${snap.loaded.length})`}>
        {snap.loaded.length === 0 ? (
          <Empty />
        ) : (
          <ul style={listStyle}>
            {snap.loaded.map((k) => (
              <li key={k.fullKey}>
                <code>{k.fullKey}</code>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Escaped namespaces (${snap.escapes.length})`}>
        {snap.escapes.length === 0 ? (
          <Empty />
        ) : (
          <ul style={listStyle}>
            {snap.escapes.map((e) => (
              <li key={`${e.namespace}:${e.file}`}>
                <code>{e.namespace}</code> — {e.file}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </aside>
  );
}

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 10 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 12 }}>{title}</h3>
      {children}
    </section>
  );
}

function Empty() {
  return <p style={{ margin: 0, opacity: 0.55 }}>—</p>;
}
