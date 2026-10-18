/** Interpret only Elasticsearch's highlight delimiters; React escapes all text fragments. */
export function renderSnippet(snippet: string) {
  let highlighted = false
  return snippet.split(/(<mark>|<\/mark>)/g).map((part, index) => {
    if (part === '<mark>') { highlighted = true; return null }
    if (part === '</mark>') { highlighted = false; return null }
    return highlighted ? <mark key={index}>{part}</mark> : part
  })
}
