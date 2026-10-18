import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderSnippet } from '../searchSnippet'

describe('search snippet rendering', () => {
  it('retains highlighting while escaping user-controlled markup', () => {
    const html = renderToStaticMarkup(<p>{renderSnippet('A <mark><img src=x onerror=alert(1)></mark> B')}</p>)
    expect(html).toContain('<mark>&lt;img src=x onerror=alert(1)&gt;</mark>')
    expect(html).not.toContain('<img')
  })
})
