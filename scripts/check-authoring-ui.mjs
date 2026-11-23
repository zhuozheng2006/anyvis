import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createAnyVisServer } from '../server/server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const shotFixture = path.join(root, 'examples/geometry-topology/codex/shot-01-01.anyvis.json');
const caption = '先看圆。';

export async function loadPlaywright() {
  const modulePath = process.env.ANYVIS_PLAYWRIGHT_MODULE;
  if (!modulePath || !path.isAbsolute(modulePath)) throw Error('Set ANYVIS_PLAYWRIGHT_MODULE to the absolute Playwright module entry.');
  return import(pathToFileURL(modulePath).href);
}

async function openProject(page, filename) {
  await page.getByRole('button', { name: '我的作品', exact: true }).click();
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '打开项目文件' }).click(),
  ]);
  await picker.setFiles(filename);
  await page.getByRole('dialog', { name: '我的作品' }).waitFor({ state: 'hidden' });
  await page.getByRole('tab', { name: '时间轴' }).click();
}

async function downloadFrom(page, control, destination) {
  const [file] = await Promise.all([page.waitForEvent('download'), control.click()]);
  assert.ok(file.suggestedFilename().endsWith(path.extname(destination)), `Unexpected download: ${file.suggestedFilename()}`);
  await file.saveAs(destination);
}

async function seekToMarkerTime(page) {
  // The fixture is 24 fps. Three ten-frame steps land at 1.25 seconds.
  const rewind = page.getByRole('button', { name: '回到开头' });
  await rewind.click();
  for (let step = 0; step < 3; step++) await rewind.press('Shift+ArrowRight');
  assert.equal(await page.locator('.tl-timecode').textContent(), '00:01:06');
}

async function inspectMovie(movie) {
  // Check the decoded content, including both edits in the first shot, as well as playback length.
  const script = `
import av, json, sys
import numpy as np
with av.open(sys.argv[1]) as media:
    video = media.streams.video[0]
    assert (video.width, video.height, video.average_rate) == (1280, 720, 24)
    count = 0
    for frame in media.decode(video):
        if count == 0:
            image = frame.to_ndarray(format='rgb24').astype('int16')
            # The turquoise circle was moved from (-4.5, 0.2) to (0, 0).
            region = image[250:470]
            ys, xs = np.where(np.max(np.abs(region - [99,219,197]), axis=2) < 40)
            assert xs.size > 150, 'No turquoise circle in the central band'
            center = [float(np.percentile(xs, [2,98]).mean()), float(250 + np.percentile(ys, [2,98]).mean())]
            assert abs(center[0]-640) < 6 and abs(center[1]-360) < 6, center
            # The shorter caption has light ink at y=-2.65 with room on both sides.
            subtitle = image[554:631]
            _, ink = np.where(np.min(subtitle, axis=2) > 180)
            assert ink.size > 60, 'No caption ink'
            caption_width = int(ink.max()-ink.min()+1)
            assert 34 <= caption_width <= 170, ('caption width', caption_width)
        last_time = float(frame.time)
        count += 1
    assert count == 600 and abs(last_time + 1/24 - 25) < 0.003, (count,last_time)
    print(json.dumps(dict(frames=count, seconds=25, width=1280, height=720, circleCenter=center, captionInkWidth=caption_width)))
`;
  const { stdout } = await promisify(execFile)(process.env.ANYVIS_PYTHON || 'python3', ['-c', script, movie], { timeout: 60_000 });
  return JSON.parse(stdout);
}

export async function runAuthoringUI(page, { directory, fixturePath = shotFixture, mode }) {
  await mkdir(directory, { recursive: true });
  page.setDefaultTimeout(25_000);
  const title = page.getByRole('textbox', { name: '作品名称' });
  const inspector = page.getByRole('region', { name: '对象管理器' });
  const field = name => inspector.getByRole('textbox', { name, exact: true });
  const selectObject = name => inspector.getByRole('button', { name: new RegExp(`^选择对象 ${name}，`) }).click();
  const savedFile = path.join(directory, 'edited.anyvis.json');
  const movie = path.join(directory, 'edited.mp4');
  const original = JSON.parse(await readFile(fixturePath, 'utf8'));
  try {
    await page.getByRole('checkbox', { name: '自动预览' }).uncheck();
    await openProject(page, fixturePath);
    assert.equal(await title.inputValue(), original.name);
    await selectObject('文12');
    await field('内容').fill(caption);
    await field('内容').press('Tab');
    await selectObject('形4');
    await inspector.getByText('位置辅助 · 九宫格与拖动定位', { exact: true }).click();
    const circle = original.actions.find(action => action.fields.name === '形4').fields;
    await inspector.locator('.pos-pad-stage').click({ button: 'right', position: { x: 10, y: 10 } });
    await page.keyboard.press('Escape');
    assert.deepEqual([Number(await field('横坐标').inputValue()), Number(await field('纵坐标').inputValue())], [circle.x, circle.y]);
    await inspector.getByRole('button', { name: '中心 (ORIGIN)' }).click();
    await seekToMarkerTime(page);
    await page.getByRole('button', { name: '添加时间轴标记', exact: true }).click();
    await downloadFrom(page, page.getByTitle('保存项目文件', { exact: false }), savedFile);
    const edited = JSON.parse(await readFile(savedFile, 'utf8'));
    assert.equal(edited.actions.find(action => action.fields.name === '文12').fields.text, caption);
    const position = edited.actions.find(action => action.fields.name === '形4').fields;
    assert.deepEqual([position.x, position.y, position.z], [0, 0, circle.z]);
    assert.deepEqual(edited.scene.markers.map(marker => marker.time), [1.25]);

    // Make a blank project before importing the saved file, so stale UI cannot pass this check.
    await page.getByRole('button', { name: '我的作品', exact: true }).click();
    await page.getByRole('button', { name: '新建作品' }).click();
    assert.notEqual(await title.inputValue(), original.name);
    await openProject(page, savedFile);
    assert.equal(await title.inputValue(), original.name);
    await selectObject('文12');
    assert.equal(await field('内容').inputValue(), caption);
    await selectObject('形4');
    assert.deepEqual([Number(await field('横坐标').inputValue()), Number(await field('纵坐标').inputValue())], [0, 0]);
    assert.equal(await page.locator('.tmb-timecode').textContent(), '01:06');
    await seekToMarkerTime(page);

    await page.getByText(/Manim .*已连接/).first().waitFor();
    await page.getByRole('button', { name: '导出', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '把作品带出去' });
    await dialog.getByRole('combobox').selectOption('final');
    await dialog.getByRole('button', { name: '生成视频' }).click();
    const link = dialog.getByRole('link', { name: '下载视频' });
    const error = dialog.locator('.video-export .inline-error');
    await link.or(error).waitFor({ timeout: 230_000 });
    if (await error.isVisible()) throw Error(`Render failed: ${await error.textContent()}`);
    await downloadFrom(page, link, movie);
    await dialog.getByRole('button', { name: '关闭对话框' }).click();
    await page.waitForFunction(() => {
      const video = document.querySelector('.stage-column video');
      if (video?.error) throw Error(video.error.message || `media error ${video.error.code}`);
      return video?.readyState >= 1 && !video.seeking && Math.abs(video.currentTime - 1.25) < 1 / 24;
    });
    assert.equal(await page.locator('.tl-timecode').textContent(), '00:01:06');
    const report = { mode, project: edited.name, rightClickPreserved: true, markerSeconds: 1.25, caption, movie: await inspectMovie(movie) };
    await writeFile(path.join(directory, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } catch (error) {
    await page.screenshot({ path: path.join(directory, 'failure.png'), timeout: 5000 }).catch(() => {});
    console.error((await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).slice(-2400));
    throw error;
  }
}

async function checkWeb() {
  const { chromium } = await loadPlaywright();
  const directory = process.env.ANYVIS_UI_OUTPUT || await mkdtemp(path.join(tmpdir(), 'anyvis-web-check-'));
  const cacheRoot = await mkdtemp(path.join(tmpdir(), 'anyvis-web-cache-'));
  const server = await createAnyVisServer({ port: 0, cacheRoot, pythonPath: process.env.ANYVIS_PYTHON });
  let browser;
  try {
    browser = await chromium.launch({ chromiumSandbox: true, executablePath: process.env.ANYVIS_CHROMIUM_BINARY || undefined });
    const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1600, height: 1100 } });
    await page.goto(`http://127.0.0.1:${server.port}`);
    await runAuthoringUI(page, { directory, mode: 'web' });
  } finally {
    try { await browser?.close(); } finally { await server.close(); await rm(cacheRoot, { recursive: true, force: true }); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--web') throw Error('Usage: node scripts/check-authoring-ui.mjs --web');
  await checkWeb();
}
