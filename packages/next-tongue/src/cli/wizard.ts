/**
 * Guided setup: `npx next-tongue` / `tongue init` (interactive).
 * detect → source → files → targets → login/link → estimate → translate.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localCostGBP, type Me } from '../cloud/api.js';
import { createCredentialStore, resolveToken } from '../cloud/credentials.js';
import { detectFramework, detectLayouts, readCatalog } from '../cloud/dictionaries.js';
import { countChars } from '../cloud/engine.js';
import { findConfigFile, formatGBP, makeClient, resolveBaseURL, upsertCloudBlock, type CloudGlobals } from '../cloud/project.js';
import { CancelledError, color, createPrompter, type Prompter } from '../cloud/tui.js';
import { loadConfig } from '../config/load-config.js';
import { cmdLink, cmdLogin, describePlan } from './cloud.js';
import { runUpdate } from './update.js';
import { cmdInit } from './init.js';

export const COMMON_LOCALES: Array<[string, string]> = [
  ['en', 'English'], ['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['de', 'German'], ['fr', 'French'], ['es', 'Spanish'],
  ['es-MX', 'Spanish (Mexico)'], ['it', 'Italian'], ['pt', 'Portuguese'], ['pt-BR', 'Portuguese (Brazil)'], ['nl', 'Dutch'],
  ['sv', 'Swedish'], ['da', 'Danish'], ['nb', 'Norwegian'], ['fi', 'Finnish'], ['pl', 'Polish'], ['cs', 'Czech'], ['sk', 'Slovak'],
  ['hu', 'Hungarian'], ['ro', 'Romanian'], ['bg', 'Bulgarian'], ['el', 'Greek'], ['tr', 'Turkish'], ['uk', 'Ukrainian'],
  ['ru', 'Russian'], ['hr', 'Croatian'], ['sr', 'Serbian'], ['sl', 'Slovenian'], ['lt', 'Lithuanian'], ['lv', 'Latvian'],
  ['et', 'Estonian'], ['ga', 'Irish'], ['cy', 'Welsh'], ['ca', 'Catalan'], ['eu', 'Basque'], ['ar', 'Arabic'], ['he', 'Hebrew'],
  ['fa', 'Persian'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['ur', 'Urdu'], ['ta', 'Tamil'], ['th', 'Thai'], ['vi', 'Vietnamese'],
  ['id', 'Indonesian'], ['ms', 'Malay'], ['fil', 'Filipino'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh-CN', 'Chinese (Simplified)'],
  ['zh-TW', 'Chinese (Traditional)'], ['sw', 'Swahili'], ['af', 'Afrikaans'],
];

const FRAMEWORK_LABEL: Record<string, string> = {
  'next-app': 'Next.js (App Router)', 'next-pages': 'Next.js (Pages Router)', nuxt: 'Nuxt', sveltekit: 'SvelteKit',
  remix: 'Remix / React Router', vite: 'Vite', node: 'Node.js', unknown: 'unknown',
};

export type WizardOptions = CloudGlobals & { prompter?: Prompter; yes?: boolean; noBrowser?: boolean; sleep?: (ms: number) => Promise<void> };

export async function runWizard(opts: WizardOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  const pr = opts.prompter ?? createPrompter();
  const g: CloudGlobals = { ...opts, cwd };
  try {
    pr.intro(`${color.magenta('next-tongue')} × ${color.bold('Loomlocale')} — translate your app`);
    const framework = await detectFramework(cwd);
    const layouts = await detectLayouts(cwd);
    let configPath = await findConfigFile(cwd, opts.config);
    let existing: Awaited<ReturnType<typeof loadConfig>>['config'] | null = null;
    if (configPath) existing = (await loadConfig({ cwd, ...(opts.config ? { configPath: opts.config } : {}) })).config;
    pr.note(
      [
        `framework   ${color.bold(FRAMEWORK_LABEL[framework] ?? framework)}`,
        `config      ${configPath ? configPath.slice(cwd.length + 1) : color.dim('none (will create tongue.config.mjs)')}`,
        `dictionaries ${layouts.length ? layouts.map((l) => `${l.pattern} [${l.locales.join(', ')}]`).join('; ') : color.dim('none found')}`,
      ].join('\n'),
      'Detected',
    );

    const known = new Set<string>([...(existing?.locales ?? []), ...layouts.flatMap((l) => l.locales)]);
    const sourceChoices = [...new Set([existing?.defaultLocale ?? 'en', ...known, 'en'])].map((l) => ({ value: l, label: l, hint: COMMON_LOCALES.find(([c]) => c === l)?.[1] ?? '' }));
    const sourceLocale = await pr.select('Source language', sourceChoices, existing?.defaultLocale ?? (known.has('en') ? 'en' : sourceChoices[0]!.value));

    const patternChoices = [
      ...new Set([...(existing?.cloud.files ?? (existing ? [existing.messages] : [])), ...layouts.map((l) => l.pattern)]),
    ].map((p) => ({ value: p, label: p }));
    let patterns: string[] = [];
    if (patternChoices.length) {
      patterns = await pr.multiselect('Which key files should be translated?', [...patternChoices, { value: '__custom__', label: 'Other folder / glob…' }], { initial: [patternChoices[0]!.value], required: true });
    }
    if (!patterns.length || patterns.includes('__custom__')) {
      patterns = patterns.filter((p) => p !== '__custom__');
      const custom = await pr.text('Dictionary path with {locale} (e.g. ./locales/{locale}/*.json)', {
        default: './messages/{locale}.json',
        validate: (v) => (v.includes('{locale}') ? null : 'must contain {locale}'),
      });
      patterns.push(custom);
    }
    const source = await readCatalog(cwd, patterns, sourceLocale);
    const keyCount = Object.keys(source.flat).length;
    if (!keyCount) {
      pr.outro(color.red(`No ${sourceLocale} strings found in ${patterns.join(', ')} — add a source dictionary and re-run.`));
      process.exitCode = 1;
      return;
    }
    const srcChars = Object.values(source.flat).reduce((n, s) => n + countChars(s), 0);

    const preselected = [...known].filter((l) => l !== sourceLocale);
    const localeChoices = [...new Set([...preselected, ...COMMON_LOCALES.map(([c]) => c)])]
      .filter((l) => l !== sourceLocale)
      .map((l) => ({ value: l, label: l, hint: COMMON_LOCALES.find(([c]) => c === l)?.[1] ?? '' }));
    const targets = await pr.multiselect('Target languages', localeChoices, { initial: preselected, required: true });
    if (!targets.length) throw new CancelledError();

    const totalChars = srcChars * targets.length;
    // Auth
    const baseURL = resolveBaseURL(g, existing ?? undefined);
    let token = await resolveToken(baseURL, env, opts.store ?? createCredentialStore(env));
    let me: Me | null = null;
    if (!token) {
      if (!(await pr.confirm('Log in to Loomlocale now? (free account, opens your browser)', true))) {
        pr.outro(`Estimated ${totalChars.toLocaleString('en-GB')} chars ≈ ${formatGBP(localCostGBP(totalChars))} PAYG. Run ${color.cyan('tongue login')} when ready.`);
        return;
      }
      me = await cmdLogin({ ...g, ...(opts.noBrowser ? { noBrowser: true } : {}), ...(opts.sleep ? { sleep: opts.sleep } : {}) });
      token = await resolveToken(baseURL, env, opts.store ?? createCredentialStore(env));
    }

    // Write / update config so link + update can load it.
    const locales = [sourceLocale, ...targets];
    const singleJson = patterns.length === 1 && /\{locale\}\.json$/.test(patterns[0]!) ? patterns[0]! : null;
    if (!configPath && framework === 'next-app' && (await pr.confirm('Also scaffold next-tongue runtime files (proxy, [locale] layout, next.config)?', false))) {
      await cmdInit({ cwd, locales: locales.join(','), default: sourceLocale, yes: true, quiet: true });
      configPath = await findConfigFile(cwd);
      existing = configPath ? (await loadConfig({ cwd })).config : null;
    }
    if (!configPath) {
      configPath = join(cwd, 'tongue.config.mjs');
      await writeFile(
        configPath,
        `/** @type {import('next-tongue/config').TongueConfig} */\nexport default {\n  locales: ${JSON.stringify(locales)},\n  defaultLocale: ${JSON.stringify(sourceLocale)},\n${singleJson ? `  messages: ${JSON.stringify(singleJson)},\n` : ''}  cloud: {\n    files: ${JSON.stringify(patterns)},\n  },\n};\n`,
        'utf8',
      );
    } else {
      let src = await readFile(configPath, 'utf8');
      src = src.replace(/locales\s*:\s*\[[^\]]*\]/, `locales: ${JSON.stringify(locales).replace(/"/g, "'")}`);
      src = src.replace(/defaultLocale\s*:\s*(['"])[^'"]*\1/, `defaultLocale: '${sourceLocale}'`);
      src = upsertCloudBlock(src, { ...(existing?.cloud.projectId ? { projectId: existing.cloud.projectId } : {}), files: patterns, ...(existing?.cloud.baseURL ? { baseURL: existing.cloud.baseURL } : {}) });
      await writeFile(configPath, src, 'utf8');
    }
    const fresh = (await loadConfig({ cwd, ...(opts.config ? { configPath: opts.config } : {}) })).config;
    let projectId = fresh.cloud.projectId;
    if (!projectId) projectId = (await cmdLink({ ...g, prompter: pr, quiet: true })).id;

    // Estimate
    const client = await makeClient(g, fresh);
    me ??= await client.me().catch(() => null);
    let estimateLine = `${keyCount} keys · ${srcChars.toLocaleString('en-GB')} chars × ${targets.length} languages = ${color.bold(totalChars.toLocaleString('en-GB'))} chars`;
    try {
      const est = await client.estimate(projectId, { sourceLocale, targetLocales: targets, items: Object.entries(source.flat).map(([key, text]) => ({ key, text })) });
      estimateLine += est.withinAllowance
        ? `\n${color.green('Included in your plan')} (${(est.allowanceRemaining ?? 0).toLocaleString('en-GB')} chars left after this run would be ${Math.max(0, (est.allowanceRemaining ?? 0) - est.billableChars).toLocaleString('en-GB')})`
        : `\nEstimated cost ${color.bold(formatGBP(est.costGBP))} (${est.billableChars.toLocaleString('en-GB')} billable chars)`;
    } catch {
      estimateLine += `\n≈ ${color.bold(formatGBP(localCostGBP(totalChars, me?.plan.paygPerMillionGBP ?? 25)))} at PAYG £25 / 1M chars ${color.dim('(local estimate)')}`;
    }
    if (me) estimateLine += `\n${color.dim(`${me.user.email} · ${describePlan(me)}`)}`;
    pr.note(estimateLine, 'Estimate');
    if (!opts.yes && !(await pr.confirm(`Translate into ${targets.join(', ')}?`, true))) {
      pr.outro('Nothing translated. Run `tongue update` any time.');
      return;
    }

    const summary = await runUpdate({ ...g, yes: true, prompter: pr, quiet: false });
    pr.note(
      [
        `${color.green(String(summary.translated))} strings translated, ${summary.failed.length ? color.red(String(summary.failed.length)) : '0'} failed validation`,
        `files: ${summary.files.join(', ') || '—'}`,
        `next: commit your dictionaries + tongue.lock; run ${color.cyan('tongue update')} after changing source strings`,
      ].join('\n'),
      'Done',
    );
    pr.outro(color.green('All set ✨'));
  } catch (err) {
    if (err instanceof CancelledError) {
      pr.outro(color.yellow('Cancelled.'));
      process.exitCode = 130;
      return;
    }
    throw err;
  }
}
