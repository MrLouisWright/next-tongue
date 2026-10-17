import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  findManifestPaths,
  loadManifest,
  resolveKey,
  type ManifestState,
} from './manifest';

const T_CALL =
  /\b(?:t(?:\.rich|\.dynamic)?|useT|getT)\s*\(\s*(['"])([^'"]+)\1/g;
const USE_T_NS =
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:useT|getT)\s*\(\s*(?:[^'"\n,]+,\s*)?(['"])([^'"]*)\2\s*\)/g;

let states: ManifestState[] = [];
const diagnosticCollection = vscode.languages.createDiagnosticCollection('next-tongue');

export function activate(context: vscode.ExtensionContext): void {
  reloadAll();

  context.subscriptions.push(
    diagnosticCollection,
    vscode.commands.registerCommand('next-tongue.reloadManifest', () => {
      reloadAll();
      void vscode.window.showInformationMessage('next-tongue: manifest reloaded');
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId.match(/typescript|javascript|tsx|jsx/)) {
        refreshDiagnostics(e.document);
      }
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => refreshDiagnostics(doc)),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.endsWith('manifest.json')) reloadAll();
      else refreshDiagnostics(doc);
    }),
    vscode.languages.registerHoverProvider(
      [
        { language: 'typescript' },
        { language: 'typescriptreact' },
        { language: 'javascript' },
        { language: 'javascriptreact' },
      ],
      { provideHover },
    ),
    vscode.languages.registerDefinitionProvider(
      [
        { language: 'typescript' },
        { language: 'typescriptreact' },
        { language: 'javascript' },
        { language: 'javascriptreact' },
      ],
      { provideDefinition },
    ),
    vscode.languages.registerInlayHintsProvider(
      [
        { language: 'typescript' },
        { language: 'typescriptreact' },
        { language: 'javascript' },
        { language: 'javascriptreact' },
      ],
      { provideInlayHints },
    ),
  );

  for (const doc of vscode.workspace.textDocuments) {
    refreshDiagnostics(doc);
  }
}

export function deactivate(): void {
  diagnosticCollection.dispose();
}

function reloadAll(): void {
  const folders = vscode.workspace.workspaceFolders ?? [];
  states = findManifestPaths(folders)
    .map(loadManifest)
    .filter((s): s is ManifestState => s != null);
  for (const doc of vscode.workspace.textDocuments) {
    refreshDiagnostics(doc);
  }
}

function stateForDoc(doc: vscode.TextDocument): ManifestState | undefined {
  const fsPath = doc.uri.fsPath;
  let best: ManifestState | undefined;
  let bestLen = -1;
  for (const s of states) {
    if (fsPath.startsWith(s.root) && s.root.length > bestLen) {
      best = s;
      bestLen = s.root.length;
    }
  }
  return best;
}

function namespacesInDoc(text: string): Map<string, string> {
  const map = new Map<string, string>();
  USE_T_NS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = USE_T_NS.exec(text))) {
    map.set(m[1]!, m[3]!);
  }
  return map;
}

function provideHover(
  doc: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  const hit = keyAtPosition(doc, position);
  if (!hit) return undefined;
  const state = stateForDoc(doc);
  if (!state) return undefined;
  const entry = resolveKey(state, hit.ns, hit.key);
  if (!entry) return undefined;

  const lines = [`**${entry.fullKey}**`, ''];
  const locales = state.manifest.locales ?? [state.manifest.defaultLocale];
  for (const locale of locales) {
    const text = entry.byLocale?.[locale] ?? (locale === state.manifest.defaultLocale ? entry.source : '—');
    lines.push(`- \`${locale}\`: ${text}`);
  }
  return new vscode.Hover(new vscode.MarkdownString(lines.join('\n')), hit.range);
}

function provideDefinition(
  doc: vscode.TextDocument,
  position: vscode.Position,
): vscode.Definition | undefined {
  const hit = keyAtPosition(doc, position);
  if (!hit) return undefined;
  const state = stateForDoc(doc);
  if (!state) return undefined;
  const entry = resolveKey(state, hit.ns, hit.key);
  if (!entry?.file) return undefined;
  const target = path.isAbsolute(entry.file)
    ? entry.file
    : path.join(state.root, entry.file);
  const line = Math.max(0, (entry.line ?? 1) - 1);
  return new vscode.Location(
    vscode.Uri.file(target),
    new vscode.Position(line, 0),
  );
}

function provideInlayHints(
  doc: vscode.TextDocument,
  range: vscode.Range,
): vscode.InlayHint[] {
  const state = stateForDoc(doc);
  if (!state) return [];
  const text = doc.getText();
  const nsMap = namespacesInDoc(text);
  const hints: vscode.InlayHint[] = [];
  T_CALL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = T_CALL.exec(text))) {
    const full = m[0]!;
    if (full.startsWith('useT') || full.startsWith('getT')) continue;
    const key = m[2]!;
    const start = doc.positionAt(m.index);
    if (!range.contains(start)) continue;
    // Find binding: look backward for `const t = useT('ns')` — use last `t` namespace
    const before = text.slice(0, m.index);
    const assign = /\b(\w+)\s*=\s*(?:await\s+)?(?:useT|getT)\s*\([^)]*\)\s*;?\s*$/.exec(
      before.split('\n').slice(-5).join('\n'),
    );
    // Prefer variable name from call site: t('x') → look up ns for `t`
    const varMatch = /\b(\w+)(?:\.rich|\.dynamic)?\s*\(\s*['"]/.exec(full);
    const varName = varMatch?.[1];
    const ns = (varName && nsMap.get(varName)) || undefined;
    const entry = resolveKey(state, ns, key);
    if (!entry?.source) continue;
    const end = doc.positionAt(m.index + full.length);
    const hint = new vscode.InlayHint(
      end,
      ` "${truncate(entry.source, 40)}"`,
      vscode.InlayHintKind.Type,
    );
    hint.paddingLeft = true;
    hints.push(hint);
    void assign;
  }
  return hints;
}

function refreshDiagnostics(doc: vscode.TextDocument): void {
  if (!doc.languageId.match(/typescript|javascript/)) {
    diagnosticCollection.delete(doc.uri);
    return;
  }
  const state = stateForDoc(doc);
  if (!state) {
    diagnosticCollection.delete(doc.uri);
    return;
  }
  const text = doc.getText();
  const nsMap = namespacesInDoc(text);
  const diags: vscode.Diagnostic[] = [];
  T_CALL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = T_CALL.exec(text))) {
    const full = m[0]!;
    if (full.startsWith('useT') || full.startsWith('getT')) continue;
    const key = m[2]!;
    const varMatch = /\b(\w+)(?:\.rich|\.dynamic)?\s*\(\s*['"]/.exec(full);
    const varName = varMatch?.[1];
    const ns = (varName && nsMap.get(varName)) || undefined;
    const entry = resolveKey(state, ns, key);
    if (!entry) {
      const start = doc.positionAt(m.index + full.indexOf(key));
      const end = start.translate(0, key.length);
      const d = new vscode.Diagnostic(
        new vscode.Range(start, end),
        `Unknown next-tongue key "${ns ? `${ns}.` : ''}${key}"`,
        vscode.DiagnosticSeverity.Error,
      );
      d.source = 'next-tongue';
      diags.push(d);
    }
  }
  diagnosticCollection.set(doc.uri, diags);
}

function keyAtPosition(
  doc: vscode.TextDocument,
  position: vscode.Position,
): { key: string; ns?: string; range: vscode.Range } | undefined {
  const text = doc.getText();
  const nsMap = namespacesInDoc(text);
  T_CALL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = T_CALL.exec(text))) {
    const full = m[0]!;
    if (full.startsWith('useT') || full.startsWith('getT')) continue;
    const key = m[2]!;
    const keyOffset = m.index + full.indexOf(key);
    const start = doc.positionAt(keyOffset);
    const end = start.translate(0, key.length);
    const range = new vscode.Range(start, end);
    if (!range.contains(position)) continue;
    const varMatch = /\b(\w+)(?:\.rich|\.dynamic)?\s*\(\s*['"]/.exec(full);
    const varName = varMatch?.[1];
    const ns = (varName && nsMap.get(varName)) || undefined;
    return { key, ...(ns ? { ns } : {}), range };
  }
  return undefined;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
