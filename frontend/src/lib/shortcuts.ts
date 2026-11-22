/** True when the event target is a place where the user types text (shortcuts must not fire there). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  // jsdom and some embedded editors do not implement isContentEditable; check the attribute too.
  return !!target.closest('[contenteditable]:not([contenteditable="false"])')
}

/** "R" without Ctrl, Alt or Meta, outside text input: reset the globe camera to its default view. */
export function isCameraResetShortcut(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return false
  if (e.key !== 'r' && e.key !== 'R') return false
  return !isTypingTarget(e.target)
}
