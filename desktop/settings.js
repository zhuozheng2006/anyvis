'use strict';
const api = window.anyvisDesktop;
const $ = id => document.getElementById(id);
let busy = false; let initialized = false;
async function refresh() {
  try {
    const state = await api.status();
    if (!initialized) { $('python').value = state.pythonPath || ''; initialized = true; }
    $('state').textContent = state.state === 'error' ? '本地引擎未能启动' : state.state === 'starting' ? '正在启动本地引擎…' : state.health?.checking ? '编辑器已就绪，正在检测 Manim…' : state.health?.available ? `Manim ${state.health.version || ''} 已就绪` : '编辑器已就绪，渲染环境待配置';
    $('detail').textContent = state.error || state.health?.error || state.warning || (state.health?.available ? `Python：${state.health.python}\n${state.health.latex ? '公式工具已就绪' : '公式渲染还需要 LaTeX 和 dvisvgm；其他积木可使用。'}` : '可以先进入编辑器。若要生成真实动画，请选择已安装 Manim 的 Python。');
    $('editor').disabled = busy || state.state !== 'ready';
  } catch (error) { $('error').textContent = error.message || '无法读取桌面状态。'; }
}
async function perform(action) {
  if (busy) return; busy = true; $('error').textContent = '';
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try { await action(); } catch (error) { $('error').textContent = error.message || '操作未完成，请重试。'; }
  finally { busy = false; for (const button of document.querySelectorAll('button')) button.disabled = false; await refresh(); }
}
$('browse').addEventListener('click', () => perform(async () => { const value = await api.choosePython(); if (value) $('python').value = value; }));
$('save').addEventListener('click', () => perform(() => api.save($('python').value)));
$('retry').addEventListener('click', () => perform(() => api.retry()));
$('editor').addEventListener('click', () => perform(() => api.editor()));
refresh();
const poll = setInterval(() => { if (!busy) refresh(); }, 1200);
window.addEventListener('pagehide', () => clearInterval(poll), { once: true });
