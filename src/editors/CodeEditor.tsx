import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { Check, Code2, Play, Square } from 'lucide-react';
import type { Project } from '../core/types';
import './code-editor.css';

interface CodeEditorProps { project: Project; onChange: (project: Project) => void }
const EXAMPLE = `// t：当前秒数；params：参数值；objects：当前帧对象\n// 修改对象的变换、颜色或可见性，然后返回数组。\nreturn objects.map(object => ({\n  ...object,\n  rotation: object.kind === 'cube' ? t : object.rotation,\n}));`;

export function CodeEditor({ project, onChange }: CodeEditorProps) {
  const [draft, setDraft] = useState(project.code);
  const [savedCode, setSavedCode] = useState(project.code);
  const [savedId, setSavedId] = useState(project.id);
  // Keep draft edits intact during ordinary playback; refresh on actual project/code change.
  if (savedCode !== project.code || savedId !== project.id) {
    setSavedId(project.id);
    setSavedCode(project.code);
    setDraft(project.code);
  }
  const dirty = draft !== project.code;
  const apply = () => onChange({ ...project, code: draft, codeEnabled: true });
  return <section className="av-code-editor" aria-label="JavaScript 代码扩展">
    <div className="av-code-toolbar">
      <div className="av-code-title"><Code2 size={15}/><span>JavaScript 扩展</span><span className="av-code-badge">可选</span></div>
      <div className="av-code-actions">
        <button type="button" className="av-code-example" onClick={() => setDraft(EXAMPLE)}>示例</button>
        {project.codeEnabled && <button type="button" onClick={() => onChange({ ...project, codeEnabled: false })}><Square size={12}/>停止</button>}
        <button type="button" className="av-code-run" onClick={apply}><Play size={12}/>{project.codeEnabled && dirty ? '应用修改' : '运行扩展'}</button>
      </div>
    </div>
    <div className="av-code-api"><code>t</code> 秒 <span>·</span><code>params.radius</code> 参数 <span>·</span><code>objects</code> 场景对象 <span>·</span><code>return objects</code></div>
    <CodeMirror value={draft} height="100%" theme="dark" extensions={[javascript()]} onChange={setDraft}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLineGutter: true, autocompletion: true }}
      aria-label="代码编辑器" className="av-code-mirror"/>
    <div className="av-code-footer"><span>{dirty ? '有未应用的修改' : project.codeEnabled ? <><Check size={12}/>扩展已启用</> : '扩展未启用'}</span><span>独立线程 · 单帧限时 250 ms</span></div>
  </section>;
}

export default CodeEditor;
