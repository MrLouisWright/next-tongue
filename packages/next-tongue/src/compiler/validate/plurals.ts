import type { MessageAst, PluralCategory } from '../ast.js';

const ALL: PluralCategory[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** Categories a locale may use, via Intl.PluralRules (CLDR). */
export function pluralCategoriesFor(locale: string): Set<PluralCategory> {
  const pr = new Intl.PluralRules(locale);
  const cats = new Set<PluralCategory>(['other']);
  // Probe a range of integers; good enough for CLDR category discovery
  for (let n = 0; n <= 200; n++) {
    cats.add(pr.select(n) as PluralCategory);
  }
  // fractions for some locales
  for (const n of [0.5, 1.5, 2.5]) {
    try {
      cats.add(pr.select(n) as PluralCategory);
    } catch {
      /* ignore */
    }
  }
  return cats;
}

export type PluralIssue = {
  kind: 'missing-category' | 'extra-category';
  category: PluralCategory;
  locale: string;
};

export function checkPluralCategories(
  ast: MessageAst,
  locale: string,
): PluralIssue[] {
  const allowed = pluralCategoriesFor(locale);
  const issues: PluralIssue[] = [];
  walk(ast);

  function walk(nodes: MessageAst): void {
    for (const el of nodes) {
      if (el.type === 'plural' || el.type === 'selectordinal') {
        const used = new Set<PluralCategory>();
        for (const opt of el.options) {
          if (typeof opt.selector === 'string' && !opt.selector.startsWith('=')) {
            const cat = opt.selector as PluralCategory;
            used.add(cat);
            if (cat !== 'other' && !allowed.has(cat)) {
              issues.push({ kind: 'extra-category', category: cat, locale });
            }
          }
          walk(opt.value);
        }
        for (const cat of ALL) {
          if (cat === 'other') continue;
          if (allowed.has(cat) && !used.has(cat)) {
            // Missing optional categories are warnings only when mismatch is strict;
            // callers decide severity. We report them.
            issues.push({ kind: 'missing-category', category: cat, locale });
          }
        }
      } else if (el.type === 'select' || el.type === 'tag') {
        if (el.type === 'select') {
          for (const opt of el.options) walk(opt.value);
        } else {
          walk(el.children);
        }
      }
    }
  }

  return issues;
}
