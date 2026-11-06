/* Offline syntax check. A full npm run build is still required for library types. */
const fs = require('node:fs');
const path = require('node:path');
let ts;
try { ts = require('typescript'); } catch { try { ts = require('/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/node_modules/typescript/lib/typescript.js'); } catch { console.error('Install TypeScript first: npm install'); process.exit(1); } }
function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):(/\.tsx?$/.test(e.name)&&!e.name.endsWith('.d.ts'))?[path.join(dir,e.name)]:[]); }
let failures=0;const files=[...walk('src'),'vite.config.ts'];
for(const file of files){const code=fs.readFileSync(file,'utf8');const result=ts.transpileModule(code,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,isolatedModules:true}});for(const d of result.diagnostics||[]){if(d.category===ts.DiagnosticCategory.Error){failures++;console.error(file,ts.flattenDiagnosticMessageText(d.messageText,'\n'));}}}
console.log(`${files.length} TypeScript/TSX files checked; ${failures} syntax errors. External library type checking requires npm run build.`);process.exitCode=failures?1:0;
