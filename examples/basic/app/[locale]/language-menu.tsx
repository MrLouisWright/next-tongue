'use client';

import { LocaleSwitcher } from '../../lib/navigation';

export function LanguageMenu() {
  return (
    <LocaleSwitcher>
      {(options) => (
        <nav aria-label="Language" data-testid="language-menu">
          <ul>
            {options.map(({ locale, label, href, current, hreflang }) => (
              <li key={locale}>
                <a
                  href={href}
                  hrefLang={hreflang}
                  lang={locale}
                  aria-current={current ? 'page' : undefined}
                  data-testid={`lang-${locale}`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </LocaleSwitcher>
  );
}
