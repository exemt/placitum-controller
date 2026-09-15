export type StatementKind =
  | 'SecRule'
  | 'SecAction'
  | 'SecMarker'
  | 'directive'
  | 'comment'
  | 'blank';

export interface SourceSpan {
  startLine: number;
  endLine: number;
}

export interface StatementBase {
  kind: StatementKind;
  raw: string;
  span: SourceSpan;
}

export interface RuleVariable {
  raw: string;
  name: string;
  selector?: string;
  count: boolean;
  exclusion: boolean;
}

export interface RuleOperator {
  raw: string;
  name: string;
  negated: boolean;
  argument: string;
  implicit: boolean;
}

export interface RuleAction {
  raw: string;
  name: string;
  value?: string;
  quoted: boolean;
}

export interface SecRuleStatement extends StatementBase {
  kind: 'SecRule';
  variables: RuleVariable[];
  operator: RuleOperator;
  actions: RuleAction[];
  id?: string;
  phase?: string;
  msg?: string;
  chained: boolean;
}

export interface SecActionStatement extends StatementBase {
  kind: 'SecAction';
  actions: RuleAction[];
  id?: string;
  phase?: string;
}

export interface SecMarkerStatement extends StatementBase {
  kind: 'SecMarker';
  label: string;
}

export interface DirectiveStatement extends StatementBase {
  kind: 'directive';
  name: string;
  args: string[];
}

export interface CommentLine extends StatementBase {
  kind: 'comment';
  text: string;
}

export interface BlankLine extends StatementBase {
  kind: 'blank';
}

export type ParsedStatement =
  | SecRuleStatement
  | SecActionStatement
  | SecMarkerStatement
  | DirectiveStatement
  | CommentLine
  | BlankLine;

export interface ParsedDocument {
  statements: ParsedStatement[];
  rules: SecRuleStatement[];
}
