import { Children, isValidElement, type ReactNode } from 'react';

function helpText(children: ReactNode): string {
  return Children.toArray(children).map(child => isValidElement<{ children?: ReactNode }>(child)
    ? helpText(child.props.children) : typeof child === 'string' || typeof child === 'number' ? String(child) : '').join(' ');
}

/** Dynamic notes feed the shared spotlight instead of opening a separate dialog. */
export function FunctionHelp({ title, children }: { title: string; children: ReactNode }) {
  return <span hidden data-help-note={title} data-help-copy={helpText(children)} />;
}
