/** Explicit, one-shot BYOK request. Nothing is persisted or retried automatically. */
import { buildPrompt, countActions, parseAIProject } from '../src/studio/ai/project-assistant.ts';
import { validateProject } from '../src/studio/core/project.ts';

function failure(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function completionEndpoint(value) {
  let url;
  try { url = new URL(String(value || '').trim()); }
  catch { throw failure('请输入有效的模型服务地址，例如 https://api.openai.com/v1。'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.hash || url.search) {
    throw failure('远程模型服务必须使用 HTTPS；本机模型可使用 localhost HTTP。地址中不要包含密钥、查询参数或用户信息。');
  }
  const base = url.pathname.replace(/\/+$/, '');
  url.pathname = base.endsWith('/chat/completions') ? base : `${base || '/v1'}/chat/completions`;
  return { url, local };
}

async function readLimited(response, maxBytes = 1_000_000) {
  if (!response.body) throw failure('模型服务返回了空响应。', 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw failure('模型响应过大，已停止接收。请缩小本次任务。', 502);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}

export async function generateProject(body, options = {}) {
  if (!body || typeof body !== 'object') throw failure('模型请求格式不正确。');
  const { url, local } = completionEndpoint(body.endpoint);
  const model = String(body.model || '').trim();
  const key = String(body.key || '').trim();
  if (!model || model.length > 150 || /[\r\n]/.test(model)) throw failure('请输入模型名称。');
  if ((!local && !key) || key.length > 4096 || /[\r\n]/.test(key)) throw failure('请输入有效 API 密钥。密钥只在本次请求中使用，不保存到作品。');
  const project = validateProject(body.project);
  const prompt = buildPrompt(project, String(body.prompt || ''));
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000);
  const isOpenAI = url.hostname === 'api.openai.com';
  const request = {
    model,
    messages: [
      { role: 'system', content: 'You produce valid, editable AnyVis project JSON. Follow the provided block catalogue exactly. Do not output executable code or Markdown.' },
      { role: 'user', content: prompt },
    ],
    // Modern OpenAI uses max_completion_tokens; most compatible providers use max_tokens.
    ...(isOpenAI ? { max_completion_tokens: 12000 } : { max_tokens: 12000 }),
    stream: false,
  };
  let response;
  try {
    response = await fetch(url, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(request),
    });
  } catch (error) {
    if (signal.aborted) throw failure('AI 请求已取消或超过两分钟。当前作品保持不变。', 408);
    throw failure('无法连接模型服务。请检查地址、网络或本地模型是否已启动。', 502);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const detail = response.status === 401 || response.status === 403 ? '密钥无效或没有模型访问权限'
      : response.status === 429 ? '服务额度不足或请求过于频繁'
      : response.status === 404 ? '模型名称或接口地址不存在' : '服务拒绝了请求';
    throw failure(`模型服务返回 ${response.status}：${detail}。当前作品保持不变。`, 502);
  }
  let text;
  try { text = await readLimited(response); }
  catch (error) {
    if (signal.aborted) throw failure('AI 请求已取消或超过两分钟。当前作品保持不变。', 408);
    throw error;
  }
  let data;
  try { data = JSON.parse(text); } catch { throw failure('模型服务没有返回兼容的 JSON 响应。', 502); }
  const message = data.choices?.[0]?.message;
  const finishReason = data.choices?.[0]?.finish_reason;
  if (finishReason === 'length') throw failure('模型输出达到长度上限，未应用不完整作品。请把动画拆成较小的任务。', 502);
  if (typeof message?.content !== 'string') throw failure('模型没有返回作品文本。请检查该模型是否支持 Chat Completions 文本输出。', 502);
  let result;
  try { result = parseAIProject(message.content, project); }
  catch (error) { throw failure(`AI 作品未通过验证：${error.message}`, 422); }
  return { project: result, summary: `已生成 ${countActions(result)} 个可编辑积木。请先预览画面，再继续精修。`,
    ...(data.usage ? { usage: { inputTokens: Number(data.usage.prompt_tokens) || 0, outputTokens: Number(data.usage.completion_tokens) || 0 } } : {}),
  };
}
