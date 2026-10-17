import { getDir } from 'next-tongue/server';

/** Shared OG markup — unit-tested for `dir` (RTL snapshot for `ar`). */
export function OgFrame({
  locale,
  title,
}: {
  locale: string;
  title: string;
}) {
  const dir = getDir(locale);
  return (
    <div
      dir={dir}
      data-testid="og-frame"
      data-dir={dir}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 64,
        background: '#0f172a',
        color: '#f8fafc',
        padding: 48,
      }}
    >
      {title}
    </div>
  );
}
