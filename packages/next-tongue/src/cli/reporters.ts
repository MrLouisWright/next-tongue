import type { CheckIssue, CheckResult } from './check-types.js';

export function summarize(issues: CheckIssue[]): CheckResult {
  let errorCount = 0;
  let warningCount = 0;
  for (const i of issues) {
    if (i.severity === 'error') errorCount++;
    else warningCount++;
  }
  return { issues, errorCount, warningCount };
}

export function reportPretty(result: CheckResult): void {
  if (result.issues.length === 0) {
    console.log('tongue check: ok');
    return;
  }
  for (const issue of result.issues) {
    const loc = formatLoc(issue);
    const tag = issue.severity === 'error' ? 'error' : 'warning';
    console.log(
      `${loc}${tag} ${issue.check}: ${issue.message}`,
    );
  }
  console.log(
    `tongue check: ${result.errorCount} error(s), ${result.warningCount} warning(s)`,
  );
}

export function reportJson(result: CheckResult): void {
  console.log(JSON.stringify(result, null, 2));
}

/** GitHub Actions workflow commands. */
export function reportGithub(result: CheckResult): void {
  for (const issue of result.issues) {
    const kind = issue.severity === 'error' ? 'error' : 'warning';
    const parts: string[] = [];
    if (issue.file) parts.push(`file=${escapeProp(issue.file)}`);
    if (issue.line != null) parts.push(`line=${issue.line}`);
    parts.push(`title=tongue ${issue.check}`);
    console.log(`::${kind} ${parts.join(',')}::${escapeData(issue.message)}`);
  }
  if (result.issues.length === 0) {
    console.log('tongue check: ok');
  }
}

function formatLoc(issue: CheckIssue): string {
  if (issue.file && issue.line != null) return `${issue.file}:${issue.line}: `;
  if (issue.file) return `${issue.file}: `;
  return '';
}

function escapeProp(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
