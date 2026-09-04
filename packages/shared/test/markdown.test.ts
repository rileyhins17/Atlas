import { describe, expect, it } from 'vitest';
import { inlineText, parseInline, parseMarkdown } from '../src/dto/markdown.js';

/**
 * Chat rendered every reply as one flat string, so a list arrived as a wall of
 * hyphens and `**bold**` kept its asterisks. These pin the shapes a model
 * actually emits — and the two that matter for safety.
 */
describe('inline', () => {
  it('reads bold, italic and code', () => {
    expect(parseInline('**a** *b* `c`')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'a' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'c' },
    ]);
  });

  /** Nothing inside backticks is markup, or `**` in a code sample vanishes. */
  it('treats code spans as literal', () => {
    expect(parseInline('`**not bold**`')).toEqual([{ kind: 'code', text: '**not bold**' }]);
  });

  it('keeps a lone asterisk as text rather than eating the sentence', () => {
    expect(inlineText(parseInline('2 * 3 = 6'))).toBe('2 * 3 = 6');
  });

  it('reads a link', () => {
    expect(parseInline('[Atlas](https://atlaslife.app)')).toEqual([
      {
        kind: 'link',
        href: 'https://atlaslife.app',
        children: [{ kind: 'text', text: 'Atlas' }],
      },
    ]);
  });

  /**
   * The reason this returns a structure and never an HTML string. Chat output
   * is untrusted: it has been through a language model and can quote whatever
   * the user's own notes contain.
   */
  it('refuses a javascript: link but keeps its words', () => {
    const nodes = parseInline('[click](javascript:alert(1))');
    // The invariant is that no link node survives, not the exact leftovers of
    // a deliberately malformed URL.
    expect(nodes.some((n) => n.kind === 'link')).toBe(false);
    expect(inlineText(nodes)).toContain('click');
  });

  it('refuses a data: link', () => {
    expect(parseInline('[x](data:text/html,<script>)')).toEqual([{ kind: 'text', text: 'x' }]);
  });

  it('allows an in-app relative link', () => {
    expect(parseInline('[today](/today)')[0]).toMatchObject({ kind: 'link', href: '/today' });
  });
});

describe('blocks', () => {
  it('reads a heading', () => {
    expect(parseMarkdown('## Your day')).toEqual([
      { kind: 'heading', level: 2, children: [{ kind: 'text', text: 'Your day' }] },
    ]);
  });

  it('reads a bulleted list as items, not as hyphens', () => {
    const blocks = parseMarkdown('- one\n- two');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false });
    const list = blocks[0] as Extract<(typeof blocks)[number], { kind: 'list' }>;
    expect(list.items.map(inlineText)).toEqual(['one', 'two']);
  });

  it('reads a numbered list and keeps where it started', () => {
    const list = parseMarkdown('3. three\n4. four')[0] as Extract<
      ReturnType<typeof parseMarkdown>[number],
      { kind: 'list' }
    >;
    expect(list.ordered).toBe(true);
    expect(list.start).toBe(3);
    expect(list.items.map(inlineText)).toEqual(['three', 'four']);
  });

  it('reads a fenced code block with its language', () => {
    expect(parseMarkdown('```ts\nconst a = 1;\n```')).toEqual([
      { kind: 'code', lang: 'ts', text: 'const a = 1;' },
    ]);
  });

  /** A reply cut off mid-block should still render what it managed to say. */
  it('renders an unterminated fence rather than dropping it', () => {
    expect(parseMarkdown('```\nhalf a thing')).toEqual([
      { kind: 'code', lang: null, text: 'half a thing' },
    ]);
  });

  it('joins wrapped lines into one paragraph, and splits on a blank line', () => {
    const blocks = parseMarkdown('one\ntwo\n\nthree');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph']);
    expect(blocks.map((b) => (b.kind === 'paragraph' ? inlineText(b.children) : ''))).toEqual([
      'one two',
      'three',
    ]);
  });

  /** "---" matches a bullet too; it has to win. */
  it('reads a rule as a rule', () => {
    expect(parseMarkdown('a\n\n---\n\nb')[1]).toEqual({ kind: 'rule' });
  });

  it('reads a quote', () => {
    expect(parseMarkdown('> mind the gap')).toEqual([
      { kind: 'quote', children: [{ kind: 'text', text: 'mind the gap' }] },
    ]);
  });

  it('ends a list when a paragraph follows it', () => {
    const blocks = parseMarkdown('- one\n- two\n\nAfter.');
    expect(blocks.map((b) => b.kind)).toEqual(['list', 'paragraph']);
  });

  it('has nothing to say about nothing', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   \n\n  ')).toEqual([]);
  });

  /** The shape a real reply takes. */
  it('reads a whole answer', () => {
    const blocks = parseMarkdown(
      ['Here is your day:', '', '- **Gym** at 6', '- Call Maya', '', 'Anything else?'].join('\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list', 'paragraph']);
  });
});
