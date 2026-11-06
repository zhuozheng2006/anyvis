# Native Manim service

With Node 22.18 or newer, `node server/server.mjs` starts an HTTP service on `127.0.0.1:4317`. It serves the built `dist/` application as well as the API. In development, Vite proxies `/api` to this service. The service uses Node's native TypeScript support to run the same project validator and compiler as the editor. Earlier Node 22 builds need the explicit `--experimental-strip-types` flag.

## Runtime

The service checks `ANYVIS_PYTHON`, a project-managed `.runtime` environment, common Conda `manim` environments, then `python3` / `python`. It does not install packages or change an existing environment. Set `ANYVIS_PORT` and `ANYVIS_UI_PORT` to change the backend and allowed development UI ports.

Desktop embedding can call `createAnyVisServer({port, cacheRoot, pythonPath, runtimeRoot, workerPath, staticRoot})`. `workerPath` must point to the physical Python worker outside the ASAR archive; `runtimeRoot` is the physical health-check working directory and the first location searched for a managed Python. `staticRoot` may point to the packaged `dist/` inside ASAR, while `cacheRoot` should use the application's writable user-data directory. An explicit `pythonPath` takes precedence over `ANYVIS_PYTHON`; either explicit setting fails visibly rather than silently switching environments. All options are optional, so ordinary development startup retains its existing paths.

`discoverPython({pythonPath, runtimeRoot, workerPath, signal})` supports aborting a running health-check process. Closing the service or failing to bind its port aborts and waits for that process to exit, so desktop startup failure and application exit do not leave a probe running in the background.

Each render runs a separate Python process and uses Manim Cairo. Preview lowers pixel dimensions to at most 960×540 while preserving the project's evaluation frame rate and logical aspect ratio. Final rendering uses the project's configured dimensions. During rendering, actual Cairo frames are published at most once every 0.6 seconds using atomic PNG replacement. This supplies visual progress before the full video is ready; it does not claim real-time playback or arbitrary timeline seeking. A newer preview for the same project cancels the older preview; final exports are queued. Preview jobs have a 120-second limit and final jobs a 600-second limit. Termination kills the worker process group on macOS / Linux.

This is a local desktop/development service, not a multi-user sandbox. Ordinary projects are validated and compiled on the server; the API does not accept raw Python as its input. Python extension blocks require `trustCode: true`. Trusted Python runs with the current user's process permissions.

`worker.py` detects codecs. Where Manim's required `libx264` is missing, it renders genuine Manim VP9 WebM and re-encodes those frames to H.264 with the installed `libopenh264`. If H.264 is unavailable or WebM contains audio that cannot safely be preserved by the fallback, the result stays WebM. The actual format is reported; no silent audio removal takes place. Rendering and exporting use the same native scene implementation.

## API

| Method and path | Request / response |
| --- | --- |
| `GET /api/session` | `{token}`; keep in memory |
| `GET /api/health` | `{available, checking?, version, pythonVersion, latex, chineseFont, codec, capabilities, error?}` |
| `POST /api/render` | `{project, quality: "preview"\|"final", revision, trustCode?}` → job |
| `GET /api/jobs/:id` | `{id,status,progress,message,revision,source,videoUrl?,posterUrl?,error?,blockId?,details?,duration?,format?,width?,height?,fps?}` |
| `DELETE /api/jobs/:id` | Cancel queued or active work; returns job |
| `GET /api/media/:id/video.mp4` | Native output or documented codec fallback; supports byte ranges |
| `GET /api/media/:id/video.webm` | Native WebM fallback; supports byte ranges |
| `GET /api/media/:id/poster.png` | Representative frame from the actual video |
| `GET /api/media/:id/preview.png` | Most recent actual frame during rendering; URL changes per published frame |
| `POST /api/ai` | Delegated to the AI adapter, with 120-second timeout |

POST and DELETE require `X-AnyVis-Token`; JSON POST requests require `Content-Type: application/json`. Host and Origin must name loopback hosts on the service or configured UI port. No CORS access is enabled; cross-site Fetch requests are rejected. Media GETs are same-origin so a normal HTML video element can play and seek. Appending `?download=1` requests a downloaded file.

All jobs preserve the request revision so the UI can ignore stale results. Diagnostic line numbers map back to block IDs through the compiler's source map. Error details are capped. At most one render process runs and three wait in the queue. The current session retains at most eighteen completed jobs with a 512 MiB soft cache budget; the latest output is retained even if it alone exceeds that budget. Intermediate Manim videos and formula files are removed after each job. Generated files live under `.anyvis-cache/`, which must not be committed. The service only exposes explicitly allowed output filenames; generated source, logs and arbitrary filesystem paths are not served as files.

## Verification

```sh
node --test server/server.test.mjs
node --test server/render.integration.mjs
```

The unit tests cover seek range behavior, cross-site requests, invalid Host headers, missing tokens, media path isolation, desktop resource injection, explicit-runtime failure and cleanup of probes on shutdown or failed binding. The integration test uses an injected worker path and runs the shared project compiler and genuine Manim for 2D, Chinese text, formulas when available and a 3D surface, then checks actual media bytes, cache revisions, source-mapped errors, trust enforcement and process cancellation. Both use the real HTTP route handler through a no-socket adapter because some build environments prohibit `listen()`. This does not replace browser or actual socket validation. The integration test explicitly skips when no Manim runtime is found.

Local verification on Manim 0.20.1 / Cairo: five unit tests and the real-render integration test passed. The worker health check found Chinese fonts, LaTeX and dvisvgm; the H.264 fallback was exercised because this PyAV build lacks `libx264`. Direct service binding in the tool execution sandbox returned `EPERM`; normal-terminal/browser startup is a separate acceptance check.
