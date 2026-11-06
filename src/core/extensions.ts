import { useEffect, useRef, useState } from 'react';
import type { Evaluation, Project, SceneObject } from './types';

export const EXTENSION_TIMEOUT_MS = 250;
import { validateExtensionResult } from './extension-result';
export { validateExtensionResult } from './extension-result';

// This provides crash / timeout isolation, not a security boundary for hostile code.
// Imports are disabled by the project loader until the user explicitly enables them.
// Common I/O APIs are removed; deploy with an appropriate CSP for defense in depth.
const WORKER_SOURCE = `
'use strict';
const respond = self.postMessage.bind(self);
for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'importScripts', 'indexedDB', 'caches']) {
  try { Object.defineProperty(self, key, { value: undefined, writable: false, configurable: false }); } catch {}
}
let run;
self.onmessage = event => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      run = new Function('t', 'params', 'objects', '"use strict";\\n' + message.code);
      respond({ type: 'ready' });
      return;
    }
    if (message.type !== 'run' || !run) return;
    const output = run(message.t, message.params, message.objects);
    if (output && typeof output.then === 'function') throw new Error('扩展须同步返回对象数组，不能返回 Promise。');
    respond({ type: 'result', id: message.id, objects: output });
  } catch (error) {
    respond({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
`;

type Frame = { t: number; evaluation: Evaluation; signature: string };
type Session = {
  key: string;
  worker: Worker;
  ready: boolean;
  busy: boolean;
  latest: Frame;
  sent: Frame | null;
  timer: ReturnType<typeof setTimeout> | null;
  requestId: number;
  lastSignature: string | null;
  stopped: boolean;
  send: () => void;
};
type ExtensionState = { key: string; objects: SceneObject[] | null; error: string | null; pending: boolean };

export function useCodeExtension(project: Project, time: number, evaluation: Evaluation): {
  objects: SceneObject[];
  error: string | null;
  pending: boolean;
} {
  const key = `${project.id}\u0000${project.code}`;
  const signature = JSON.stringify([time, evaluation.parameters, evaluation.objects]);
  const latest = useRef<Frame>({ t: time, evaluation, signature });
  latest.current = { t: time, evaluation, signature };
  const sessionRef = useRef<Session | null>(null);
  const [state, setState] = useState<ExtensionState>({ key: '', objects: null, error: null, pending: false });

  useEffect(() => {
    if (!project.codeEnabled) {
      setState({ key: '', objects: null, error: null, pending: false });
      return;
    }
    if (typeof Worker === 'undefined') {
      setState({ key, objects: null, error: '当前浏览器不支持 Worker，代码扩展未运行。', pending: false });
      return;
    }
    setState({ key, objects: null, error: null, pending: true });
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      setState({ key, objects: null, error: error instanceof Error ? error.message : '扩展线程启动失败。', pending: false });
      return;
    }
    URL.revokeObjectURL(url);
    const session: Session = {
      key, worker, ready: false, busy: false, latest: latest.current, sent: null,
      timer: null, requestId: 0, lastSignature: null, stopped: false, send: () => undefined,
    };
    sessionRef.current = session;
    const stop = () => {
      session.stopped = true;
      if (session.timer) clearTimeout(session.timer);
      worker.terminate();
    };
    const fail = (error: string) => {
      if (session.stopped || sessionRef.current !== session) return;
      stop();
      setState({ key, objects: null, error, pending: false });
    };
    session.send = () => {
      if (session.stopped || !session.ready || session.busy || session.lastSignature === session.latest.signature) return;
      session.busy = true;
      session.sent = session.latest;
      session.lastSignature = session.sent.signature;
      const id = ++session.requestId;
      session.timer = setTimeout(() => fail('扩展超过 250 ms，已停止。修改代码后可重新运行。'), EXTENSION_TIMEOUT_MS);
      worker.postMessage({ type: 'run', id, t: session.sent.t, params: session.sent.evaluation.parameters, objects: session.sent.evaluation.objects });
    };
    worker.onmessage = (event: MessageEvent) => {
      if (session.stopped || sessionRef.current !== session) return;
      const message: unknown = event.data;
      if (typeof message !== 'object' || message === null) {
        fail('扩展返回了无效的线程消息。');
        return;
      }
      const response = message as Record<string, unknown>;
      if (response.type === 'ready' && !session.ready) {
        if (session.timer) clearTimeout(session.timer);
        session.ready = true;
        session.send();
      } else if (response.type === 'error') {
        fail(String(response.error).slice(0, 500));
      } else if (response.type === 'result' && response.id === session.requestId && session.sent) {
        if (session.timer) clearTimeout(session.timer);
        session.busy = false;
        try {
          const objects = validateExtensionResult(response.objects, session.sent.evaluation.objects);
          setState({ key, objects, error: null, pending: false });
        } catch (error) {
          fail(error instanceof Error ? error.message : '扩展返回数据无效。');
          return;
        }
        if (session.latest !== session.sent) session.send();
      }
    };
    worker.onerror = event => {
      event.preventDefault();
      fail(event.message || '扩展线程运行失败。');
    };
    worker.onmessageerror = () => fail('无法读取扩展返回值，请返回普通对象数组。');
    session.timer = setTimeout(() => fail('扩展线程启动超时。'), 3_000);
    worker.postMessage({ type: 'init', code: project.code });
    return () => {
      stop();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [key, project.id, project.code, project.codeEnabled]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || session.key !== key || !project.codeEnabled || session.stopped) return;
    session.latest = latest.current;
    session.send();
  }, [key, time, signature, project.codeEnabled]);

  const active = project.codeEnabled && state.key === key;
  // A result may lag one animation frame, but must not resurrect deleted objects
  // or carry a previous scene's object types while a replacement is computing.
  const resultFitsScene = state.objects !== null
    && state.objects.length === evaluation.objects.length
    && state.objects.every((object, index) => object.id === evaluation.objects[index].id
      && object.kind === evaluation.objects[index].kind);
  return {
    objects: active && state.objects && resultFitsScene ? state.objects : evaluation.objects,
    error: active ? state.error : null,
    pending: active ? state.pending : false,
  };
}
