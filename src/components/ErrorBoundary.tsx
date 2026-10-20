import { Component, type ReactNode } from 'react';

interface Props {
  /** Changing this (e.g. the route) clears a previous error. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  key: string;
}

/** Keeps one broken screen from blanking the whole app. */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="banner error" role="alert">
          This screen hit a problem: {this.state.error.message}. Try Refresh, or go to another page.
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
