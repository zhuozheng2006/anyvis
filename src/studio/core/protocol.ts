// Increment when project values accepted by the engine change. A running Node
// process retains old module code even when Vite hot-reloads the editor.
export const AUTHORING_PROTOCOL = 3;
export function engineCompatibilityError(health: { authoringProtocol?: number }): string | null {
  return health.authoringProtocol === AUTHORING_PROTOCOL ? null :
    '编辑器与本地服务版本不一致。请在启动终端按 Ctrl+C，再运行 npm run studio；桌面版请退出后重新打开新版程序。';
}
