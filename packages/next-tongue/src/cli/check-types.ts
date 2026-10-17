export type CheckKind =
  | 'missing'
  | 'unused'
  | 'undefined'
  | 'mismatch'
  | 'syntax'
  | 'stale'
  | 'a11y'
  | 'bidi'
  | 'length';

export type CheckSeverity = 'error' | 'warn';

export type CheckIssue = {
  check: CheckKind;
  severity: CheckSeverity;
  message: string;
  locale?: string;
  key?: string;
  file?: string;
  line?: number;
};

export type CheckResult = {
  issues: CheckIssue[];
  errorCount: number;
  warningCount: number;
};
