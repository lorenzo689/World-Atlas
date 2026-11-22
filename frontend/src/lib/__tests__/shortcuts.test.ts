import { afterEach, describe, expect, it } from 'vitest'
import { isCameraResetShortcut, isTypingTarget } from '../shortcuts'

function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  let seen: KeyboardEvent | null = null
  const listener = (e: Event) => { seen = e as KeyboardEvent }
  window.addEventListener('keydown', listener)
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  window.removeEventListener('keydown', listener)
  if (!seen) throw new Error('keydown did not reach window')
  return seen
}

function mount<T extends HTMLElement>(el: T): T {
  document.body.append(el)
  return el
}

afterEach(() => document.body.replaceChildren())

describe('isCameraResetShortcut', () => {
  it('accepts r and R (Shift/Caps Lock) on the page', () => {
    expect(isCameraResetShortcut(press(document.body, { key: 'r' }))).toBe(true)
    expect(isCameraResetShortcut(press(document.body, { key: 'R', shiftKey: true }))).toBe(true)
    expect(isCameraResetShortcut(press(mount(document.createElement('button')), { key: 'r' }))).toBe(true)
  })

  it('ignores other keys', () => {
    for (const key of ['e', 't', 'Escape', '/', 'ArrowRight']) {
      expect(isCameraResetShortcut(press(document.body, { key }))).toBe(false)
    }
  })

  it('ignores Ctrl, Alt and Meta combinations', () => {
    expect(isCameraResetShortcut(press(document.body, { key: 'r', ctrlKey: true }))).toBe(false)
    expect(isCameraResetShortcut(press(document.body, { key: 'r', altKey: true }))).toBe(false)
    expect(isCameraResetShortcut(press(document.body, { key: 'r', metaKey: true }))).toBe(false)
    expect(isCameraResetShortcut(press(document.body, { key: 'R', ctrlKey: true, shiftKey: true }))).toBe(false)
  })

  it('ignores typing in inputs, textareas, selects and editable elements', () => {
    const input = mount(document.createElement('input'))
    const search = mount(Object.assign(document.createElement('input'), { type: 'search' }))
    const textarea = mount(document.createElement('textarea'))
    const select = mount(document.createElement('select'))
    const editable = mount(document.createElement('div'))
    editable.setAttribute('contenteditable', 'true')
    const nested = editable.appendChild(document.createElement('span'))
    for (const target of [input, search, textarea, select, editable, nested]) {
      expect(isCameraResetShortcut(press(target, { key: 'r' }))).toBe(false)
    }
  })

  it('ignores key repeat and events already handled elsewhere', () => {
    expect(isCameraResetShortcut(press(document.body, { key: 'r', repeat: true }))).toBe(false)
    const handled = new KeyboardEvent('keydown', { key: 'r', cancelable: true })
    handled.preventDefault()
    expect(isCameraResetShortcut(handled)).toBe(false)
  })
})

describe('isTypingTarget', () => {
  it('treats contenteditable="false" and plain elements as not typing', () => {
    const off = mount(document.createElement('div'))
    off.setAttribute('contenteditable', 'false')
    expect(isTypingTarget(off)).toBe(false)
    expect(isTypingTarget(mount(document.createElement('div')))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(window)).toBe(false)
  })
})
