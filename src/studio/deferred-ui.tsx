import { Component, Suspense, lazy, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import './deferred-ui.css';

type Loader<P> = () => Promise<{ default: ComponentType<P> }>;
type DialogProps = { isOpen: boolean; onClose: () => void };

class LoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function LoadStatus({ title, retry, onClose }: { title: string; retry?: () => void; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);
  const content = <section className="deferred-status" role={onClose ? 'dialog' : undefined} aria-modal={onClose ? true : undefined} aria-label={title}>
    <p role={retry ? 'alert' : 'status'}>{retry ? `暂时无法打开${title}，请重试。` : `正在加载${title}…`}</p>
    <div>{retry && <button type="button" onClick={retry}>重试</button>}{onClose && <button type="button" autoFocus onClick={onClose}>关闭</button>}</div>
  </section>;
  return onClose ? <div className="deferred-backdrop">{content}</div> : content;
}

function deferred<P extends object>(load: Loader<P>, fallback: (props: P, retry?: () => void) => ReactNode) {
  const Initial = lazy(load);
  return function Deferred(props: P) {
    const [{ Content, attempt }, setAttempt] = useState(() => ({ Content: Initial, attempt: 0 }));
    // React.lazy caches rejected promises too; a retry needs a fresh lazy wrapper.
    const retry = () => setAttempt(previous => ({ Content: lazy(load), attempt: previous.attempt + 1 }));
    return <LoadBoundary key={attempt} fallback={fallback(props, retry)}>
      <Suspense fallback={fallback(props)}><Content {...props} /></Suspense>
    </LoadBoundary>;
  };
}

export function deferredPanel<P extends object>(load: Loader<P>, title: string): ComponentType<P> {
  return deferred(load, (_props, retry) => <LoadStatus title={title} retry={retry} />);
}

export function deferredDialog<P extends DialogProps>(load: Loader<P>, title: string): ComponentType<P> {
  const Content = deferred(load, (props, retry) => props.isOpen
    ? <LoadStatus title={title} retry={retry} onClose={props.onClose} /> : null);
  return function DeferredDialog(props: P) {
    const [opened, setOpened] = useState(props.isOpen);
    useEffect(() => { if (props.isOpen) setOpened(true); }, [props.isOpen]);
    useEffect(() => {
      if (!props.isOpen) return;
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        props.onClose();
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }, [props.isOpen, props.onClose]);
    // Never mount unused tools. Once opened, preserve their settings on close.
    return opened || props.isOpen ? <Content {...props} /> : null;
  };
}
