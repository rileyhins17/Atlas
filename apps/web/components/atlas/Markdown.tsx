'use client';

import { Fragment, type ReactNode } from 'react';
import { parseMarkdown, type InlineNode, type MarkdownBlock } from '@atlas/shared';

/**
 * Render a model's reply as the document it is.
 *
 * The chat used to print the raw string, so a list came out as a wall of
 * hyphens and `**bold**` arrived with its asterisks still attached. The parser
 * hands back nodes rather than HTML, so this renders React elements and there
 * is no `dangerouslySetInnerHTML` — model output cannot inject markup, which
 * matters because it can quote whatever the user's own notes contain.
 */
function Inline({ nodes }: { nodes: InlineNode[] }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return <Fragment key={i}>{node.text}</Fragment>;
      case 'code':
        return (
          <code key={i} className="md-code">
            {node.text}
          </code>
        );
      case 'strong':
        return (
          <strong key={i}>
            <Inline nodes={node.children} />
          </strong>
        );
      case 'em':
        return (
          <em key={i}>
            <Inline nodes={node.children} />
          </em>
        );
      case 'link':
        return (
          <a
            key={i}
            href={node.href}
            className="md-link"
            // Only relevant for the http(s) links; harmless on an in-app one.
            target={node.href.startsWith('/') ? undefined : '_blank'}
            rel="noopener noreferrer"
          >
            <Inline nodes={node.children} />
          </a>
        );
    }
  });
}

function Block({ block }: { block: MarkdownBlock }): ReactNode {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p className="md-p">
          <Inline nodes={block.children} />
        </p>
      );
    case 'heading': {
      // h4-h6 rather than h1-h3: a chat reply sits inside the page's own
      // heading order and must not claim to be a top-level section of it.
      const Tag = (['h4', 'h5', 'h6'] as const)[block.level - 1]!;
      return (
        <Tag className={`md-h md-h${block.level}`}>
          <Inline nodes={block.children} />
        </Tag>
      );
    }
    case 'list':
      return block.ordered ? (
        <ol className="md-list" start={block.start}>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline nodes={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="md-list">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline nodes={item} />
            </li>
          ))}
        </ul>
      );
    case 'code':
      return (
        <pre className="md-pre">
          <code>{block.text}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote className="md-quote">
          <Inline nodes={block.children} />
        </blockquote>
      );
    case 'rule':
      return <hr className="md-rule" />;
  }
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  // Nothing parseable (a reply that is only whitespace) still renders the raw
  // string rather than nothing at all — an empty bubble looks like a failure.
  if (blocks.length === 0) return <p className="md-p">{text}</p>;
  return (
    <div className="md">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}
