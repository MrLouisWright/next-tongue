export declare function createMockLoomlocale(opts?: {
  token?: string;
  approveAfter?: number;
  projects?: Array<{ id: string; name: string; sourceLocale: string; targetLocales: string[] }>;
  glossary?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  breakKeys?: string[];
}): {
  state: {
    requests: Array<{ method: string; path: string; body: unknown; auth: string | null }>;
    webEdits: Array<Record<string, unknown>>;
    entries: Map<string, unknown>;
    projects: Array<{ id: string; name: string }>;
    plan: Record<string, unknown>;
  };
  listen(port?: number): Promise<string>;
  close(): Promise<void>;
};
