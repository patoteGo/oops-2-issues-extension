import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../markdown.js'

describe('renderMarkdown — basics', () => {
  it('returns empty string for empty/null input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null)).toBe('')
    expect(renderMarkdown(undefined)).toBe('')
  })

  it('renders a paragraph', () => {
    expect(renderMarkdown('hello world')).toBe('<p>hello world</p>')
  })

  it('merges consecutive lines into one paragraph with <br/>', () => {
    expect(renderMarkdown('line one\nline two')).toBe(
      '<p>line one<br/>line two</p>'
    )
  })
})

describe('renderMarkdown — headings', () => {
  it('renders h1 to h6', () => {
    expect(renderMarkdown('# Title')).toBe('<h1>Title</h1>')
    expect(renderMarkdown('## Sub')).toBe('<h2>Sub</h2>')
    expect(renderMarkdown('###### Deepest')).toBe('<h6>Deepest</h6>')
  })
})

describe('renderMarkdown — inline formatting', () => {
  it('bold via ** and __', () => {
    expect(renderMarkdown('**bold**')).toBe('<p><strong>bold</strong></p>')
    expect(renderMarkdown('__bold__')).toBe('<p><strong>bold</strong></p>')
  })

  it('italic via * and _', () => {
    expect(renderMarkdown('a *b* c')).toBe('<p>a <em>b</em> c</p>')
    expect(renderMarkdown('a _b_ c')).toBe('<p>a <em>b</em> c</p>')
  })

  it('inline code escapes html chars exactly once', () => {
    expect(renderMarkdown('use `<b>` pls')).toBe(
      '<p>use <code>&lt;b&gt;</code> pls</p>'
    )
  })
})

describe('renderMarkdown — links & images', () => {
  it('renders a link', () => {
    const out = renderMarkdown('[EP](https://ep.test)')
    expect(out).toBe(
      '<p><a href="https://ep.test" rel="noreferrer noopener" target="_blank">EP</a></p>'
    )
  })

  it('renders an image with lazy loading', () => {
    const out = renderMarkdown('![alt](https://ep.test/x.png)')
    expect(out).toContain(
      '<img alt="alt" src="https://ep.test/x.png" loading="lazy" />'
    )
  })

  it('strips dangerous URL schemes from links/images (defence-in-depth)', () => {
    const out = renderMarkdown('[x](javascript:alert(1))')
    expect(out).toContain('href=""')
    expect(out).not.toContain('javascript:')

    const imgOut = renderMarkdown('![](javascript:alert(1))')
    expect(imgOut).not.toContain('javascript:')
  })

  it('preserves a literal & in a URL via a single escape (regression)', () => {
    // Previously double-escaped to href="http://x?a=1&amp;amp;b=2".
    const out = renderMarkdown('[a](http://x?a=1&b=2)')
    expect(out).toContain('href="http://x?a=1&amp;b=2"')
    expect(out).not.toContain('amp;amp')
  })

  it('renders a link title (regression: titles were never parsed)', () => {
    // The " title delimiter was escaped to &quot; before the regex ran.
    const out = renderMarkdown('[a](http://x "tip")')
    expect(out).toBe(
      '<p><a href="http://x" rel="noreferrer noopener" target="_blank" title="tip">a</a></p>'
    )
  })

  it('renders an image title', () => {
    const out = renderMarkdown('![](http://x/y.png "a title")')
    expect(out).toContain(
      '<img alt="" src="http://x/y.png" title="a title" loading="lazy" />'
    )
  })

  it('single-escapes & inside a link title (no double-escape)', () => {
    const out = renderMarkdown('[a](http://x "tip&q")')
    expect(out).toContain('title="tip&amp;q"')
    expect(out).not.toContain('amp;amp')
  })

  it('escapes < > inside a link title', () => {
    const out = renderMarkdown('[a](http://x "a < b")')
    expect(out).toContain('title="a &lt; b"')
  })

  it('allows a ) inside a link title', () => {
    const out = renderMarkdown('[a](http://x "a)b")')
    expect(out).toContain('title="a)b"')
  })
})

describe('renderMarkdown — blocks', () => {
  it('renders an unordered list', () => {
    const out = renderMarkdown('- a\n- b\n- c')
    expect(out).toBe('<ul>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n</ul>')
  })

  it('renders an ordered list', () => {
    const out = renderMarkdown('1. first\n2. second')
    expect(out).toBe('<ol>\n<li>first</li>\n<li>second</li>\n</ol>')
  })

  it('renders a single-line blockquote', () => {
    expect(renderMarkdown('> quoted')).toBe('<blockquote>quoted</blockquote>')
  })

  it('renders a multi-line blockquote as one element', () => {
    expect(renderMarkdown('> line one\n> line two')).toBe(
      '<blockquote>line one line two</blockquote>'
    )
  })

  it('renders a horizontal rule', () => {
    expect(renderMarkdown('---')).toBe('<hr/>')
  })

  it('renders a fenced code block', () => {
    const out = renderMarkdown('```\nconst x = 1\n```')
    expect(out).toBe('<pre><code>const x = 1</code></pre>')
  })

  it('escapes html inside a fenced code block exactly once (regression)', () => {
    // Previously double-escaped to &amp;lt;b&amp;gt;.
    const out = renderMarkdown('```\n<b>\n```')
    expect(out).toBe('<pre><code>&lt;b&gt;</code></pre>')
  })
})

describe('renderMarkdown — HTML escaping (safety)', () => {
  it('escapes raw html in body text', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
    )
  })

  it('escapes ampersands and quotes in text', () => {
    expect(renderMarkdown('a & b "c"')).toBe('<p>a &amp; b &quot;c&quot;</p>')
  })
})
