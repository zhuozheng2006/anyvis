import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAction,getBlockDefinition} from '../../../src/studio/core/catalog.ts';
import {compileProject} from '../../../src/studio/core/compiler.ts';
const dir=path.dirname(fileURLToPath(import.meta.url));
const files=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
const manifest=[];
for(let chapter=1;chapter<=6;chapter++){
 const projects=files.slice((chapter-1)*12,chapter*12).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f))));
 const dimension=projects.some(p=>p.scene.dimension==='3d')?'3d':'2d';
 const combined={schemaVersion:2,id:`geometry-topology-chapter-${chapter}`,name:`几何与拓扑 · 第${chapter}章`,scene:{...projects[0].scene,dimension},actions:[]};
 projects.forEach((p,i)=>{
  const prefix=`c${chapter}s${i+1}_`,renames=new Map(),trackers=new Map();
  for(const a of p.actions){if(getBlockDefinition(a.type).createsObject){renames.set(a.fields.name,prefix+a.fields.name);if(a.type==='tracker')trackers.set(a.fields.name,prefix+a.fields.name);}}
  const clone=a=>{
   const next=structuredClone(a);next.id=prefix+next.id;const d=getBlockDefinition(a.type);
   if(d.createsObject)next.fields.name=renames.get(a.fields.name);
   for(const f of d.fields){
    if(f.reference==='object')next.fields[f.name]=renames.get(a.fields[f.name])||a.fields[f.name];
    if(f.reference==='object-list')next.fields[f.name]=String(a.fields[f.name]).split(',').map(n=>renames.get(n.trim())||n.trim()).join(',');
    if(f.type==='expression')next.fields[f.name]=String(a.fields[f.name]).replace(/\b[A-Za-z_]\w*\b/g,n=>trackers.get(n)||n);
   }
   if(a.children)next.children=a.children.map(clone);return next;
  };
  const children=p.actions.map(clone);
  if(dimension==='3d'&&p.scene.dimension==='2d'){
   children.unshift({...createAction('camera',{phi:0,theta:-90,zoom:1,duration:0}),id:prefix+'camera'});
   for(let k=children.length-1;k>=0;k--)if(children[k].type==='text')children.splice(k+1,0,{...createAction('fixed_in_frame',{target:children[k].fields.name}),id:prefix+'fixed'+k});
  }
  const members=p.actions.filter(a=>getBlockDefinition(a.type).createsObject&&a.type!=='tracker').map(a=>renames.get(a.fields.name));
  children.push({...createAction('group',{name:prefix+'cleanup',members:members.join(',')}),id:prefix+'cleanupgroup'},{...createAction('remove',{target:prefix+'cleanup'}),id:prefix+'cleanupremove'});
  combined.actions.push({...createAction('sequence',{label:p.name}),id:prefix+'sequence',children});
 });
 const compiled=compileProject(combined);if(compiled.diagnostics.some(d=>d.severity==='error')||compiled.duration!==300||compiled.requiresTrust)throw Error(JSON.stringify(compiled.diagnostics));
 const filename=`chapter-${String(chapter).padStart(2,'0')}.anyvis.json`;fs.writeFileSync(path.join(dir,filename),JSON.stringify(combined,null,2)+'\n');manifest.push(filename);
}
fs.writeFileSync(path.join(dir,'chapters-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Six editable chapters compiled: 300 s each, native blocks only.');
