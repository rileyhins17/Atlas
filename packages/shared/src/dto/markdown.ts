/**
 * A small Markdown parser for what a chat model actually emits.
 *
 * Atlas rendered every reply as one flat string, so a list came out as a wall
 * of hyphens and `**bold**` arrived with the asterisks still on. That is the
 * single biggest reason the chat read as unfinished next to a real assistant.
 *
 * It returns a STRUCTURE, never an HTML string. React renders the nodes, so
 * there is no `dangerouslySetInnerHTML` anywhere and model output cannot inject
 * markup by construction — which matters more here than anywhere else in the
 * app, because this is untrusted text that has just been through a language
 * model and can quote whatever the user's own notes contain.
 *
 * Deliberately small: headings, lists, fenced code, quotes, rules, and inline
 * bold/italic/code/links. Anything it does not know stays literal text, which
 * is the honest failure mode — a stray asterisk is better than a swallowed
 * sentence.
 */

export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: InlineNode[] }
  | { kind: 'em'; children: InlineNode[] }
  | { kind: 'link'; href: string; children: InlineNode[] };

export type MarkdownBlock =
  | { kind: 'paragraph'; children: InlineNode[] }
  | { kind: 'heading'; level: 1 | 2 | 3; children: InlineNode[] }
  | { kind: 'list'; ordered: boolean; start: number; items: InlineNode[][] }
  | { kind: 'code'; lang: string | null; text: string }
  | { kind: 'quote'; children: InlineNode[] }
  | { kind: 'rule' };

/**
 * Only schemes a link can safely be. `javascript:` and `data:` are the two that
 * turn a rendered link into script execution, and a model repeating text from a
 * note is exactly how one would arrive here.
 */
const SAFE_SCHEME = /^(https?:|mailto:)/i;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (SAFE_SCHEME.test(trimmed)) return trimmed;
  // Relative links inside the app are fine; anything else with a scheme is not.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return null;
}

/** `**bold**`, `*italic*`, `` `code` ``, `[text](url)` — in that precedence. */
export function parseInline(src: string): InlineNode[] {
  const out: InlineNode[] = [];
  let text = '';

  const flush = () => {
    if (text) out.push({ kind: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);

    // Code first: nothing inside a backtick span is markup.
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ kind: 'code', text: code[1]! });
      i += code[0].length;
      continue;
    }

    const strong = /^\*\*([^*]+)\*\*/.exec(rest) ?? /^__([^_]+)__/.exec(rest);
    if (strong) {
      flush();
      out.push({ kind: 'strong', children: parseInline(strong[1]!) });
      i += strong[0].length;
      continue;
    }

    const em = /^\*([^*\n]+)\*/.exec(rest) ?? /^_([^_\n]+)_/.exec(rest);
    if (em) {
      flush();
      out.push({ kind: 'em', children: parseInline(em[1]!) });
      i += em[0].length;
      continue;
    }

    const link = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      const href = safeHref(link[2]!);
      flush();
      if (href) {
        out.push({ kind: 'link', href, children: parseInline(link[1]!) });
      } else {
        // Unsafe scheme: keep the words, drop the link. Silently rendering
        // nothing would lose the sentence.
        out.push(...parseInline(link[1]!));
      }
      i += link[0].length;
      continue;
    }

    text += src[i];
    i += 1;
  }

  flush();
  return out;
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^```\s*([A-Za-z0-9+#-]*)\s*$/;

export function parseMarkdown(src: string): MarkdownBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  /** Paragraph and quote text runs until a blank line or a new block starts. */
  const gather = (stop: (line: string) => boolean, strip?: RegExp): string => {
    const parts: string[] = [];
    while (i < lines.length) {
      const line = lines[i]!;
      if (line.trim() === '' || stop(line)) break;
      parts.push(strip ? (strip.exec(line)?.[1] ?? line).trim() : line.trim());
      i += 1;
    }
    return parts.join(' ');
  };

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      i += 1;
      const body: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i]!)) {
        body.push(lines[i]!);
        i += 1;
      }
      // An unterminated fence still yields its code — a model that gets cut off
      // mid-block should not take the whole answer down with it.
      if (i < lines.length) i += 1;
      blocks.push({ kind: 'code', lang: fence[1] || null, text: body.join('\n') });
      continue;
    }

    // Before the list check: "---" is a rule, and also matches a bullet.
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1]!.length) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, children: parseInline(heading[2]!.trim()) });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const text = gather((l) => !QUOTE.test(l), QUOTE);
      blocks.push({ kind: 'quote', children: parseInline(text) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const start = numbered ? Number(numbered[1]) : 1;
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const current = lines[i]!;
        const b = BULLET.exec(current);
        const n = NUMBERED.exec(current);
        if (ordered ? !n : !b) break;
        // A rule looks like a bullet; it ends the list rather than joining it.
        if (!ordered && RULE.test(current)) break;
        items.push(parseInline((ordered ? n![2]! : b![1]!).trim()));
        i += 1;
      }
      blocks.push({ kind: 'list', ordered, start, items });
      continue;
    }

    const text = gather(
      (l) => BULLET.test(l) || NUMBERED.test(l) || HEADING.test(l) || QUOTE.test(l) || /^```/.test(l),
    );
    if (text) blocks.push({ kind: 'paragraph', children: parseInline(text) });
  }

  return blocks;
}

/** Plain text of a rendered document — for copy-to-clipboard and for tests. */
export function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => (n.kind === 'text' || n.kind === 'code' ? n.text : inlineText(n.children)))
    .join('');
}
