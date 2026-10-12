import { Component, type ReactNode } from 'react'
import { ErrorState } from '@/components/ui/feedback'

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

interface State {
  failed: boolean
}

/** Catches WebGL initialisation failures so the rest of the UI (search, country pages) keeps working. */
export class WebGLBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: !hasWebGL() }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <ErrorState
            title="The 3D globe isn’t available"
            message="Your browser or device doesn’t support WebGL. You can still search for a country above and open its page."
          />
        </div>
      )
    }
    return this.props.children
  }
}
