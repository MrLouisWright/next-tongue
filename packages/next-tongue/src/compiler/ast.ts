export type SourceLocation = {
  start: number;
  end: number;
  line: number;
  column: number;
};

export type LiteralElement = {
  type: 'literal';
  value: string;
  loc: SourceLocation;
};

export type ArgumentElement = {
  type: 'argument';
  name: string;
  loc: SourceLocation;
};

export type NumberStyle =
  | 'integer'
  | 'percent'
  | 'currency'
  | { skeleton: string }
  | { preset: string };

export type NumberElement = {
  type: 'number';
  name: string;
  style?: NumberStyle;
  loc: SourceLocation;
};

export type DateTimeStyle = 'short' | 'medium' | 'long' | 'full' | { skeleton: string } | { preset: string };

export type DateElement = {
  type: 'date';
  name: string;
  style?: DateTimeStyle;
  loc: SourceLocation;
};

export type TimeElement = {
  type: 'time';
  name: string;
  style?: DateTimeStyle;
  loc: SourceLocation;
};

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export type PluralBranch = {
  selector: PluralCategory | `=${number}`;
  value: MessageAst;
  loc: SourceLocation;
};

export type PluralElement = {
  type: 'plural' | 'selectordinal';
  name: string;
  offset: number;
  options: PluralBranch[];
  loc: SourceLocation;
};

export type SelectBranch = {
  selector: string;
  value: MessageAst;
  loc: SourceLocation;
};

export type SelectElement = {
  type: 'select';
  name: string;
  options: SelectBranch[];
  loc: SourceLocation;
};

export type PoundElement = {
  type: 'pound';
  loc: SourceLocation;
};

export type TagElement = {
  type: 'tag';
  name: string;
  children: MessageAst;
  selfClosing: boolean;
  loc: SourceLocation;
};

export type MessageElement =
  | LiteralElement
  | ArgumentElement
  | NumberElement
  | DateElement
  | TimeElement
  | PluralElement
  | SelectElement
  | PoundElement
  | TagElement;

export type MessageAst = MessageElement[];

export type ArgKind =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'bigint-number' }
  | { kind: 'date' }
  | { kind: 'select'; options: string[] }
  | { kind: 'rich'; selfClosing: boolean };

export type InferredArgs = Record<string, ArgKind>;

export function collectArgs(ast: MessageAst, into: InferredArgs = {}): InferredArgs {
  for (const el of ast) {
    switch (el.type) {
      case 'literal':
      case 'pound':
        break;
      case 'argument':
        mergeArg(into, el.name, { kind: 'string' });
        break;
      case 'number':
        mergeArg(into, el.name, { kind: 'bigint-number' });
        break;
      case 'date':
      case 'time':
        mergeArg(into, el.name, { kind: 'date' });
        break;
      case 'plural':
      case 'selectordinal':
        mergeArg(into, el.name, { kind: 'number' });
        for (const opt of el.options) collectArgs(opt.value, into);
        break;
      case 'select':
        mergeArg(into, el.name, {
          kind: 'select',
          options: el.options.map((o) => o.selector).filter((s) => s !== 'other'),
        });
        for (const opt of el.options) collectArgs(opt.value, into);
        break;
      case 'tag':
        mergeArg(into, el.name, { kind: 'rich', selfClosing: el.selfClosing });
        collectArgs(el.children, into);
        break;
    }
  }
  return into;
}

function mergeArg(into: InferredArgs, name: string, next: ArgKind): void {
  const prev = into[name];
  if (!prev) {
    into[name] = next;
    return;
  }
  if (prev.kind === next.kind) {
    if (prev.kind === 'select' && next.kind === 'select') {
      into[name] = {
        kind: 'select',
        options: [...new Set([...prev.options, ...next.options])],
      };
    }
    return;
  }
  // Prefer richer types
  const rank: Record<ArgKind['kind'], number> = {
    string: 0,
    select: 1,
    number: 2,
    'bigint-number': 3,
    date: 3,
    rich: 4,
  };
  if (rank[next.kind] > rank[prev.kind]) into[name] = next;
}
