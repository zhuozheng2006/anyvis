import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAction } from '../../../src/studio/core/catalog.ts';
import { compileProject } from '../../../src/studio/core/compiler.ts';
const dir=path.dirname(fileURLToPath(import.meta.url));
const story=JSON.parse(fs.readFileSync(path.join(dir,'../storyboard.json'),'utf8'));
const C={ink:'#E6EDF6',muted:'#A8B7CC',teal:'#63DBC5',purple:'#B6A1F2',gold:'#F3CD85',red:'#F69A87',bg:'#0B1324'};
const TAU=Math.PI*2;
let actions,serial,names,phaseA,phaseB,dim;
const make=(type,fields={})=>({...createAction(type,fields),id:`s${++serial}`});
const push=(type,fields={})=>{const a=make(type,fields);actions.push(a);return a;};
const name=p=>`${p}${++names}`;
const text=(value,x=0,y=0,size=28,color=C.ink)=>{const id=name('文');push('text',{name:id,text:value,x,y,fontSize:size,color,maxWidth:Math.abs(x)>1?4.1:12.4,appear:'none'});if(dim==='3d')push('fixed_in_frame',{target:id});return id;};
const shape=(type,fields={})=>{const id=name('形');const defaults=createAction(type).fields;const extra=Object.fromEntries(Object.entries({name:id,color:C.teal,fill:0,appear:'none'}).filter(([k])=>k in defaults));push(type,{...extra,...fields});return fields.name||id;};
const line=(x1,y1,x2,y2,color=C.teal,dashed=false)=>shape(dashed?'dashed_line':'line',{x1,y1,x2,y2,color});
const dot=(x,y,color=C.gold,radius=.065)=>shape('dot',{x,y,color,radius,fill:1});
const group=(members)=>{const id=name('组');push('group',{name:id,members:members.join(',')});return id;};
const anim=(list,type,fields)=>list.push(make(type,{duration:3,...fields}));
const parallel=(list,children)=>list.push({...make('parallel'),children});
const label=(value,x=0,y=1.9,color=C.gold)=>text(value,x,y,24,color);
const ring=(x=0,y=.2,r=1.25,color=C.teal)=>shape('circle',{x,y,radius:r,color});
const curve=(xExpr,yExpr,zExpr='0',color=C.teal,tMin=0,tMax=TAU)=>shape('parametric_curve',{xExpr,yExpr,zExpr,color,tMin,tMax});
function triangle(x=-1.5,y=-.8,s=1,color=C.teal){return group([line(x,y,x+3*s,y,color),line(x,y,x,y+2*s,color),line(x+3*s,y,x,y+2*s,color)]);}
function stretch(){const a=ring(-2.2,.2,1.1);const b=shape('ellipse',{x:2.2,y:.2,width:3.6,height:2.2,color:C.purple});line(-3.3,.2,-1.1,.2,C.gold);line(.4,.2,4,.2,C.gold);label('圆周',-2.2,-1.5,C.teal);label('椭圆',2.2,-1.5,C.purple);anim(phaseA,'passing_flash',{target:a,duration:3});const target=shape('ellipse',{x:-2.2,y:.2,width:4.4,height:2.2,appear:'hidden'});anim(phaseB,'transform',{target:a,destination:target,duration:4});return[a,b];}
function collapse(horizontal=false){const a=ring(0,.2,1.3);const p=dot(horizontal?-1.3:0,horizontal?.2:-1.1,C.gold),q=dot(horizontal?1.3:0,horizontal?.2:1.5,C.red);label('不同的点，能否唯一找回？');parallel(phaseB,[make('move',{target:p,x:0,y:horizontal?.2:0,z:0,duration:4}),make('move',{target:q,x:0,y:horizontal?.2:0,z:0,duration:4}),make('apply_matrix',{target:a,matrix:horizontal?'[[0,0],[0,1]]':'[[1,0],[0,0]]',duration:4})]);return[a,p,q];}
function components(){const a=ring(-2.5,.2,1.15);ring(1.4,.65,.65,C.purple);ring(3,-.35,.65,C.purple);label('一个分支',-2.5,-1.5);label('两个分支',2.2,-1.5);const p=dot(-1.35,.2);anim(phaseA,'path_move',{target:p,path:a,duration:5,easing:'linear'});anim(phaseB,'passing_flash',{target:a,duration:4});}
function fourShapes(){const a=ring(-4.5,.2,.85),b=shape('square',{x:-1.5,y:.2,side:1.5,color:C.purple}),c=ring(1.5,.2,1.2,C.gold),d=shape('ellipse',{x:4.5,y:.2,width:2.3,height:1.3,color:C.red});['圆周','方形边界','大圆周','椭圆'].forEach((v,i)=>label(v,-4.5+i*3,-1.55,[C.teal,C.purple,C.gold,C.red][i]));anim(phaseA,'rotate',{target:b,angle:45,duration:3});anim(phaseB,'indicate',{target:d,duration:2});return[a,b,c,d];}
function cards(words){const ids=words.map((word,i)=>{const x=(i-(words.length-1)/2)*4;shape('rounded_rectangle',{x,y:.3,width:3.5,height:1.8,color:[C.teal,C.purple,C.gold][i%3],fill:.06});return text(word,x,.3,25);});ids.forEach((id,i)=>anim(i<1?phaseA:phaseB,'indicate',{target:id,duration:2}));return ids;}
function network({diagonal=true,tree=false,pentagon=false}={}){const points=pentagon?Array.from({length:5},(_,i)=>[1.4*Math.cos(Math.PI/2+TAU*i/5),.2+1.4*Math.sin(Math.PI/2+TAU*i/5)]):[[-1.8,-1],[1.8,-1],[1.8,1.4],[-1.8,1.4]];const edges=[];for(let i=0;i<points.length-(tree?1:0);i++){const a=points[i],b=points[(i+1)%points.length];edges.push(line(...a,...b));}if(diagonal&&!tree)edges.push(line(...points[0],...points[2],C.purple));points.forEach(([x,y],i)=>{dot(x,y);text(String.fromCharCode(65+i),x+(x>0?.2:-.2),y+(y>0?.22:-.22),19,C.gold);});return{edges,points};}
function torus(x=0,color=C.teal){return shape('surface',{xExpr:`${x}+(1.35+0.45*cos(v))*cos(u)`,yExpr:'(1.35+0.45*cos(v))*sin(u)',zExpr:'0.45*sin(v)',uMin:0,uMax:TAU,vMin:0,vMax:TAU,resolution:20,color});}
function mobius(x=0){return shape('surface',{xExpr:`${x}+(1.45+v*cos(u/2))*cos(u)`,yExpr:'(1.45+v*cos(u/2))*sin(u)',zExpr:'v*sin(u/2)',uMin:0,uMax:TAU,vMin:-.48,vMax:.48,resolution:24,color:C.purple});}
function knots(){const a=curve('-2.6+1.2*cos(t)','1.2*sin(t)','0',C.teal);const b=curve('2.6+0.52*(sin(t)+2*sin(2*t))','0.52*(cos(t)-2*cos(2*t))','-0.52*sin(3*t)',C.purple);label('圆结',-3,-1.8,C.teal);label('三叶结',3,-1.8,C.purple);anim(phaseA,'passing_flash',{target:a,duration:4});anim(phaseB,'rotate',{target:b,axis:'UP',angle:80,duration:5});}
function gluing(reverse=false){shape('square',{side:2.8,x:0,y:.2,color:C.muted});shape('arrow',{x1:-1.4,y1:-1,x2:-1.4,y2:1.3,color:C.teal});shape('arrow',{x1:1.4,y1:reverse?1.3:-1,x2:1.4,y2:reverse?-1:1.3,color:C.teal});shape('arrow',{x1:-1.2,y1:1.6,x2:1.2,y2:1.6,color:C.purple});shape('arrow',{x1:-1.2,y1:-1.2,x2:1.2,y2:-1.2,color:C.purple});label('a',0,1.9,C.purple);label('a',0,-1.55,C.purple);label('b',-1.85,.2,C.teal);label(reverse?'反向对应':'同向对应',3,.3,C.gold);const id=text(reverse?'Klein 瓶粘边图':'环面粘边图',-4,.3,25);anim(phaseB,'indicate',{target:id,duration:2});}
function graphBeat(b){const g=network({tree:[7,8].includes(b),pentagon:b===10});if(b===1){label('边只在指定顶点相遇');anim(phaseB,'passing_flash',{target:g.edges.at(-1),duration:4});}if(b===2){label('V = 4     E = 5');for(const edge of g.edges)anim(phaseB,'indicate',{target:edge,duration:1});}if([3,4,6].includes(b)){const f1=text('F₁',.7,-.2,24,C.purple),f2=text('F₂',-.7,.7,24,C.purple);if(b===6){phaseB.push(make('remove',{target:f1}),make('remove',{target:f2}));const merged=text('一个内部面',0,.3,25,C.purple);push('remove',{target:merged});phaseB.push(make('add',{target:merged}));}text('F₃：外部',4,1,25,C.gold);label(b===4?'4 − 5 + 3 = 2':'面是平面的区域，外部也算');}if(b===5){label('(4, 5, 3) → (5, 6, 3)');const p=dot(0,-1,C.red);push('remove',{target:p});anim(phaseB,'fade_in',{target:p,duration:1});anim(phaseB,'indicate',{target:g.edges[0],duration:3});}if(b===6){anim(phaseB,'uncreate',{target:g.edges.at(-1),duration:4});label('ΔE = −1，ΔF = −1',0,-1.9);}if(b===7){label('桥：没有替代路线');anim(phaseB,'passing_flash',{target:g.edges[1],duration:4});}if(b===8){label('树：E = V − 1，F = 1');text('V − (V − 1) + 1 = 2',4,.1,23,C.gold);}if(b===9){label('删回路边，直到成为树');anim(phaseA,'uncreate',{target:g.edges.at(-1),duration:3});anim(phaseB,'uncreate',{target:g.edges[0],duration:3});}if(b===10){label('V = 5，E = 6，F = ?');const ans=text('F = 2 − 5 + 6 = 3',4,.3,23,C.gold);push('remove',{target:ans});anim(phaseB,'fade_in',{target:ans,duration:2});}if(b===11){label('图本身：V − E = −1');text('加入二维面后\nV − E + F = 2',4,.2,25,C.purple);}if(b===12){label('同一个计数，能用于不同曲面吗？');text('球面：χ = 2\n环面：χ = ?',4,.2,25,C.gold);}}
function visual(ch,b){
 if(ch===1){
  if([1,7].includes(b))fourShapes();
  if(b===2){ring(-2.4);shape('circle',{x:2.4,y:.2,radius:1.25,fill:.35,color:C.purple});label('只有圆周',-2.4,-1.5);label('包含内部',2.4,-1.5);for(const[x,y]of[[2,.2],[2.7,.6],[2.8,-.3]]){const id=dot(x,y);anim(phaseB,'indicate',{target:id,duration:1});}}
  if([3,4,8].includes(b)){const a=triangle(-4,-.8,.7);const c=shape('copy',{target:a,x:2.3,y:.2});label('距离不变，位置可以变');anim(phaseB,b===3?'shift':'rotate',b===3?{target:c,dx:.8,dy:.5,dz:0,duration:4}:{target:c,angle:90,duration:4});}
  if(b===5){ring(-2.8,.2,.7);const c=ring(2.4,.2,.7,C.purple);anim(phaseB,'scale',{target:c,factor:2,duration:4});label('长度 × 2，比例不变');}
  if([6,9].includes(b))stretch();if(b===10)components();if(b===11)cards(['观察','规定规则','给出理由']);if(b===12)cards(['距离与角度','连续对应','分类的边界']);
 }
 if(ch===2){
  if([1,2,3,4,5,6,7,8].includes(b)){const a=triangle(b===5?-1.6:-2,b===5?-.7:-1,b===5?.6:1);label(['','A(0,0)  B(3,0)  C(0,2)','3² + 2² = 13','(x, y) → (x+1, y−1)','(x, y) → (−y, x)','长度 × 2，角度不变','面积：3 → 12','(x, y) → (x+y, y)','同样的面积，不同的角度'][b]);const lx=text('3',-.5,-1.35,23,C.gold),ly=text('2',-2.35,0,23,C.gold);if([3,4,5,7,8].includes(b))phaseB.push(make('remove',{target:lx}),make('remove',{target:ly}));
   if([1,2].includes(b))anim(phaseB,'passing_flash',{target:a,duration:4});
   if(b===3)anim(phaseB,'shift',{target:a,dx:1,dy:-1,dz:0,duration:4});
   if(b===4){const dest=group([line(-2,-1,-2,2),line(-2,-1,-4,-1),line(-2,2,-4,-1)]);push('remove',{target:dest});anim(phaseB,'transform',{target:a,destination:dest,duration:4});}
   if(b===5)anim(phaseB,'scale',{target:a,factor:2,duration:4});
   if(b===6){shape('rectangle',{x:-.5,y:0,width:3,height:2,fill:.12,color:C.purple});text('½ × 底 × 高',3.8,.4,26,C.gold);anim(phaseB,'indicate',{target:a,duration:3});}
   if([7,8].includes(b)){const dest=group([line(-2,-1,1,-1),line(-2,-1,0,1),line(1,-1,0,1)]);push('remove',{target:dest});anim(phaseB,'transform',{target:a,destination:dest,duration:4});}
  }
  if(b===9)stretch();if(b===10)collapse(true);if(b===11)cards(['旋转：保距','缩放：保角','剪切：本例保面积']);if(b===12){stretch();label('拿走标尺，再看对应关系');}
 }
 if(ch===3){
  if([1,5].includes(b)){stretch();label(b===5?'f(x,y) = (2x,y)；逆为 (x/2,y)':'相邻点仍连续对应');}
  if([2,3,11].includes(b))collapse();
  if(b===4){ring(-3);ring(3,.2,1.25,C.purple);shape('arrow',{x1:-1.5,y1:.7,x2:1.5,y2:.7,color:C.gold});shape('arrow',{x1:1.5,y1:-.3,x2:-1.5,y2:-.3,color:C.purple});label('双射 + 正向连续 + 逆向连续');}
  if(b===6){ring(-2.4);shape('square',{x:2.4,y:.2,side:2.5,color:C.purple});for(let i=0;i<8;i++){const t=i*TAU/8,co=Math.cos(t),si=Math.sin(t),m=Math.max(Math.abs(co),Math.abs(si));dot(-2.4+1.25*co,.2+1.25*si,C.gold);dot(2.4+1.25*co/m,.2+1.25*si/m,C.gold);}label('沿射线对应：角点不妨碍同胚');shape('tracker',{name:'ray',value:0});shape('dynamic_dot',{xExpr:'-2.4+1.25*cos(ray)',yExpr:'0.2+1.25*sin(ray)',zExpr:'0',color:C.gold});shape('dynamic_dot',{xExpr:'2.4+1.25*cos(ray)/max(abs(cos(ray)),abs(sin(ray)))',yExpr:'0.2+1.25*sin(ray)/max(abs(cos(ray)),abs(sin(ray)))',zExpr:'0',color:C.gold});shape('dynamic_line',{x1Expr:'-2.4',y1Expr:'0.2',x2Expr:'-2.4+1.25*cos(ray)',y2Expr:'0.2+1.25*sin(ray)',color:C.gold});shape('dynamic_line',{x1Expr:'2.4',y1Expr:'0.2',x2Expr:'2.4+1.25*cos(ray)/max(abs(cos(ray)),abs(sin(ray)))',y2Expr:'0.2+1.25*sin(ray)/max(abs(cos(ray)),abs(sin(ray)))',color:C.gold});anim(phaseB,'animate_value',{target:'ray',value:TAU,duration:7,easing:'linear'});}
  if(b===7)components();if(b===8)cards(['空间之间的映射','随时间变化的过程']);if(b===9)knots();
  if(b===10){const grid=[];for(let x=-4;x<=4;x++)grid.push(line(x,-1.5,x,1.5,'#30445E'));for(let y=-1;y<=1;y++)grid.push(line(-4,y,4,y,'#30445E'));const a=ring(0,0,1.1);grid.push(a,dot(1.1,0),dot(0,1.1,C.red));const ambient=group(grid);anim(phaseB,'apply_matrix',{target:ambient,matrix:'[[1,0.5],[0,1]]',duration:4});label('曲线与周围网格，一起连续可逆地变');}
  if(b===12){network();label('不变量不同 ⇒ 不能同胚');}
 }
 if(ch===4)graphBeat(b);
 if(ch===5){
  if(b===1){shape('sphere',{radius:1.4,x:-2,color:C.teal});shape('circle',{x:2.7,y:.2,radius:1.3,fill:.25,color:C.purple});line(1.4,.2,4,.2,C.purple);label('薄壳：二维曲面',-2,-1.8);label('实心球的截面示意',2.7,-1.8);}
  if(b===2){const c=shape('cube',{side:2.1,color:C.teal});label('V = 8，E = 12，F = 6');anim(phaseB,'rotate',{target:c,axis:'UP',angle:65,duration:5});}
  if(b===3){const t=torus();anim(phaseB,'rotate',{target:t,axis:'RIGHT',angle:45,duration:5});label('一个把手，零条边界');}
  if(b===4)gluing();if(b===5){gluing();label('四个角 → 一个顶点',0,2.3);text('1 − 2 + 1 = 0',4,-1.3,28,C.gold);}
  if(b===6){shape('sphere',{radius:1.1,x:-2.7,color:C.teal});torus(2.7,C.purple);label('χ = 2',-2.7,-1.8);label('χ = 0',2.7,-1.8);}
  if(b===7){shape('annulus',{x:-3.6,y:.2,innerRadius:.7,outerRadius:1.2,fill:.3});const outer=shape('ellipse',{x:0,y:.2,width:2.6,height:1.6,color:C.purple,fill:.18});shape('ellipse',{x:0,y:.2,width:1.1,height:.55,color:C.bg,fill:1});shape('circle',{x:3.6,y:.2,radius:1.2,fill:.3,color:C.gold});label('圆环：b = 2',-3.6,-1.5);label('环面示意：b = 0',0,-1.5);label('圆盘：b = 1',3.6,-1.5);}
  if(b===8){const m=mobius(2.5);shape('surface',{xExpr:'-2.5+(1.2+v)*cos(u)',yExpr:'(1.2+v)*sin(u)',zExpr:'0',uMin:0,uMax:TAU,vMin:-.35,vMax:.35,resolution:20,color:C.teal});label('普通环带：b = 2',-2.5,-1.7);label('莫比乌斯带：b = 1',2.5,-1.7);anim(phaseB,'rotate',{target:m,axis:'OUT',angle:70,duration:5});}if(b===9){mobius();label('沿中心一周，局部横向反转');shape('dot',{x:1.77,y:0,z:0,radius:.055,color:C.muted,fill:1});shape('dot',{x:1.13,y:0,z:0,radius:.055,color:C.muted,fill:1});const p=shape('tracker',{name:'travel',value:0});const d1=shape('dynamic_dot',{xExpr:'(1.45+0.32*cos(travel/2))*cos(travel)',yExpr:'(1.45+0.32*cos(travel/2))*sin(travel)',zExpr:'0.32*sin(travel/2)',color:C.gold,radius:.09});shape('dynamic_dot',{xExpr:'(1.45-0.32*cos(travel/2))*cos(travel)',yExpr:'(1.45-0.32*cos(travel/2))*sin(travel)',zExpr:'-0.32*sin(travel/2)',color:C.red,radius:.09});anim(phaseB,'animate_value',{target:'travel',value:TAU,duration:7,easing:'linear'});}
  if(b===10){shape('surface',{xExpr:'(1.45+v)*cos(u)',yExpr:'(1.45+v)*sin(u)',zExpr:'0',uMin:0,uMax:TAU,vMin:-.4,vMax:.4,resolution:20,color:C.teal});shape('tracker',{name:'travel',value:0});shape('dynamic_dot',{xExpr:'1.75*cos(travel)',yExpr:'1.75*sin(travel)',zExpr:'0.03',radius:.08,color:C.gold});shape('dynamic_dot',{xExpr:'1.15*cos(travel)',yExpr:'1.15*sin(travel)',zExpr:'0.03',radius:.08,color:C.red});anim(phaseB,'animate_value',{target:'travel',value:TAU,duration:7,easing:'linear'});label('普通环带：一周后朝向恢复');}
  if(b===11){cards(['连通、紧致','可定向','无边界']);label('χ = 2 − 2g',0,-1.25);}
  if(b===12){gluing(true);text('同为 χ = 0\n定向性不同',4,-1.1,25,C.gold);}
 }
 if(ch===6){
  if([1,12].includes(b))fourShapes();if(b===2)stretch();if(b===3)components();if(b===4)graphBeat(3);if(b===5){shape('annulus',{x:-2.5,y:.2,innerRadius:.7,outerRadius:1.2,fill:.3});label('圆环：χ=0，b=2',-2.5,-1.5);shape('rectangle',{x:2.5,y:.2,width:2.6,height:1.6,color:C.purple});shape('arrow',{x1:1.2,y1:-.5,x2:1.2,y2:.9,color:C.gold});shape('arrow',{x1:3.8,y1:.9,x2:3.8,y2:-.5,color:C.gold});label('反向粘合：b=1',2.5,-1.5);}
  if(b===6)collapse();if(b===7)knots();if(b===8)cards(['χ','边界数','定向性']);if(b===9)cards(['连通分支','边界','把手']);if(b===10)cards(['已解释的推理','已引用的定理']);if(b===11){shape('circle',{x:-2.6,y:.2,radius:1.25,fill:.25});label('圆盘：χ=1，b=1',-2.6,-1.6);text('带一条边界的环面\nχ = 2 − 2×1 − 1 = −1',2.6,.3,25,C.purple);}
 }
 if(!phaseA.length){const target=actions.find(a=>['circle','square','line','parametric_curve','sphere','surface','cube'].includes(a.type));if(target)anim(phaseA,'indicate',{target:target.fields.name,duration:2});}
 if(!phaseB.length){const target=actions.findLast(a=>a.type==='text');if(target)anim(phaseB,'indicate',{target:target.fields.name,duration:2});}
}
function wrap(str,limit=24){const chars=[...str];let lines=[],row='';for(let i=0;i<chars.length;i++){row+=chars[i];if([...row].length>=limit&&! '，。；：？！、）'.includes(chars[i+1]||' ')){lines.push(row);row='';}}if(row)lines.push(row);return lines.join('\n');}
const manifest=[],report=[];
for(let ci=0;ci<story.chapters.length;ci++)for(let bi=0;bi<story.chapters[ci].beats.length;bi++){
 const chapter=story.chapters[ci],beat=chapter.beats[bi];const ch=ci+1,b=bi+1;serial=names=0;actions=[];phaseA=[];phaseB=[];dim=(ch===3&&b===9)||(ch===5&&[1,2,3,6,8,9,10].includes(b))||(ch===6&&b===7)?'3d':'2d';
 if(dim==='3d')push('camera',{phi:65,theta:-60,zoom:.9,duration:0});
 text(`${String(ch).padStart(2,'0')} / ${chapter.title}`,0,3.52,16,C.muted);
 text(beat.title,0,2.85,32);
 text(`形状不只一种看法  ·  ${ch}.${String(b).padStart(2,'0')}  /  ANYVIS`,0,-3.65,13,C.muted);
 visual(ch,b);
 const c1=text(wrap(beat.caption1),0,-2.65,26),c2=text(wrap(beat.caption2),0,-2.65,26);
 push('remove',{target:c2});
 const project={schemaVersion:2,id:`geometry-topology-${ch}-${String(b).padStart(2,'0')}`,name:`${ch}.${String(b).padStart(2,'0')} ${beat.title}`,scene:{dimension:dim,width:1280,height:720,fps:24,background:C.bg},actions};
 const time=()=>{const c=compileProject(project);const e=c.diagnostics.filter(d=>d.severity==='error');if(e.length)throw Error(`${project.name}: ${JSON.stringify(e)}`);return c.duration;};
 actions.push(...phaseA);let used=time();if(used<12)push('wait',{duration:12-used});
 push('remove',{target:c1});push('add',{target:c2});actions.push(...phaseB);used=time();if(used>25)throw Error(`Shot exceeds 25s: ${project.name}`);push('wait',{duration:25-used});
 const result=compileProject(project);if(result.requiresTrust)throw Error('Non-native block detected');
 const filename=`shot-${String(ch).padStart(2,'0')}-${String(b).padStart(2,'0')}.anyvis.json`;fs.writeFileSync(path.join(dir,filename),JSON.stringify(project,null,2)+'\n');manifest.push(filename);report.push({file:filename,blocks:actions.length,duration:result.duration,dimension:dim});
}
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(dir,'authoring-report.json'),JSON.stringify({generatedAt:new Date().toISOString(),nativeOnly:true,shots:report,totalDuration:report.reduce((s,r)=>s+r.duration,0)},null,2)+'\n');console.log(`Generated ${report.length} editable shots, ${report.reduce((s,r)=>s+r.duration,0)} seconds.`);
