#!/usr/bin/env python3
"""Read the installed Manim API and generate signature-driven editor metadata.

No calls to constructors, renderers, callbacks, network or installation commands.
An unavailable module is recorded; it is never silently counted as supported.
"""
from __future__ import annotations
import argparse
import ast
import enum
import hashlib
import importlib
import inspect
import json
import math
from pathlib import Path
import re
import sys
import textwrap

import manim
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = Path(manim.__file__).parent

def clean(text):
    return re.sub(r' at 0x[0-9a-fA-F]+', '', str(text)).replace(str(PACKAGE), '<manim>')

def literal(value):
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, (float, np.floating)) and math.isfinite(value):
        return float(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, manim.ManimColor):
        return value.to_hex()
    if isinstance(value, (list, tuple)) and len(value) <= 100:
        return [literal(v) for v in value]
    if isinstance(value, np.ndarray) and value.size <= 100:
        return {'$array': literal(value.tolist())}
    if isinstance(value, dict) and len(value) <= 50 and all(isinstance(k, str) for k in value):
        return {k: literal(v) for k, v in value.items()}
    raise ValueError('nonliteral')

def parameters(obj, skip_receiver=False):
    try:
        signature = inspect.signature(obj)
    except (TypeError, ValueError):
        return [{'name':'args','kind':'var_positional','annotation':'','required':False,'default':None}, {'name':'kwargs','kind':'var_keyword','annotation':'','required':False,'default':None}], None
    result = []
    for p in signature.parameters.values():
        if skip_receiver and p.name in ('self', 'cls'):
            continue
        default = None
        if p.default is not inspect.Parameter.empty:
            try: default = {'value': literal(p.default)}
            except (ValueError, TypeError): default = {'description': clean(repr(p.default))[:180]}
        result.append({'name': p.name, 'kind': p.kind.name.lower(),
                       'annotation': clean(p.annotation) if p.annotation is not inspect.Parameter.empty else '',
                       'required': p.default is inspect.Parameter.empty and p.kind not in (p.VAR_POSITIONAL, p.VAR_KEYWORD),
                       'default': default})
    return result, clean(signature)

def kind_of(cls):
    try:
        if issubclass(cls, manim.Animation): return 'animation'
        if issubclass(cls, manim.ValueTracker): return 'tracker'
        if issubclass(cls, manim.Mobject):
            for base, kind in [('ThreeDAxes','axes3d'),('Axes','axes'),('NumberLine','number_line'),('MathTex','formula'),('Text','text'),('DecimalNumber','number'),('Graph','graph'),('Matrix','matrix')]:
                if issubclass(cls, getattr(manim, base)): return kind
            return 'mobject'
        if issubclass(cls, manim.Scene): return 'scene'
        if issubclass(cls, manim.Camera): return 'camera'
        if issubclass(cls, enum.Enum): return 'enum'
    except TypeError: pass
    return 'value'

def category(module):
    groups = [('animation','动画'),('camera','镜头'),('scene','场景'),('geometry','几何'),('graphing','坐标与函数'),('three_d','三维'),('text','文字与公式'),('table','表格'),('matrix','矩阵'),('graph','图结构'),('vector_field','向量场'),('color','颜色'),('rate_functions','节奏'),('bezier','曲线计算'),('space_ops','空间计算'),('mobject','对象方法')]
    return next((label for key,label in groups if key in module), '工具与配置')

def consumed_parent_parameters(cls):
    """Hide parent arguments already supplied by an intermediate constructor.

    E.g. FadeOut accepts *mobjects, then _Fade supplies Animation.mobject itself.
    Exposing that inherited keyword would look valid but fail at runtime.
    **kwargs remains available for genuinely dynamic constructor forwarding.
    """
    consumed=set(); inherited_masks={}
    for index, base in enumerate(cls.__mro__[:-1]):
        initializer=vars(base).get('__init__')
        if initializer is None:
            inherited_masks[cls.__mro__[index+1]]=set(consumed)
            continue
        try:
            tree=ast.parse(textwrap.dedent(inspect.getsource(initializer)))
            parent=cls.__mro__[index+1]
            parent_params,_=parameters(parent,False)
            positional=[p['name'] for p in parent_params if p['kind'] in ('positional_only','positional_or_keyword')]
            for node in ast.walk(tree):
                if not (isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and node.func.attr=='__init__' and isinstance(node.func.value,ast.Call) and isinstance(node.func.value.func,ast.Name) and node.func.value.func.id=='super'): continue
                consumed.update(k.arg for k in node.keywords if k.arg)
                for position,arg in enumerate(node.args):
                    if isinstance(arg,ast.Starred): break
                    if position<len(positional): consumed.add(positional[position])
        except (OSError,TypeError,SyntaxError): pass
        inherited_masks[cls.__mro__[index+1]]=set(consumed)
    return inherited_masks

def risky(module, name, result_kind):
    if module.startswith('manimpango') or module.startswith('manim.mobject.text'): return True
    if name in {'Axes','ThreeDAxes','NumberPlane','ComplexPlane','register_font','add_coordinates','add_labels','add_numbers','get_coordinate_labels','get_number_mobject','get_number_mobjects'}: return True
    if any(part in module for part in ('file_ops','commands','sounds','tex_file_writing','images','scene_file_writer','renderer','opengl','plugins','_config','debug')):
        return True
    if name in {'DecimalNumber','Integer','Variable','NumberLine','Table','Matrix','MobjectMatrix','DecimalMatrix','IntegerMatrix','MathTable','IntegerTable','DecimalTable','BarChart','SampleSpace'}: return True
    if result_kind in ('scene','camera') or module.startswith('manim.camera'): return True
    if module.startswith('manim.scene'):
        return name not in {'add','remove','clear','play','wait','add_foreground_mobject','add_foreground_mobjects','remove_foreground_mobject','remove_foreground_mobjects','bring_to_front','bring_to_back','set_camera_orientation','move_camera','begin_ambient_camera_rotation','stop_ambient_camera_rotation','add_fixed_in_frame_mobjects','remove_fixed_in_frame_mobjects','add_fixed_orientation_mobjects','remove_fixed_orientation_mobjects'}
    if any(x in name.lower() for x in ('file','image','svg','tex','code','sound','write','open','save','load','render')):
        return name not in {'Write','Unwrite','DrawBorderThenFill','get_image'}
    return False

def generate():
    modules = {'manim'}
    for root in ('animation','camera','mobject','scene','utils','renderer','_config'):
        for f in (PACKAGE/root).rglob('*.py'):
            parts = f.relative_to(PACKAGE).with_suffix('').parts
            if any(p.startswith('_') for p in parts[1:] if p != '__init__'): continue
            if 'docbuild' in parts: continue  # documentation-build tooling, separate scope
            modules.add('manim.'+'.'.join(parts[:-1] if parts[-1]=='__init__' else parts))
    modules.update(('manim.constants','manim.typing'))
    objects = {}; constants = {}; failures=[]; scanned=[]
    for name in sorted(modules):
        try: module=importlib.import_module(name)
        except Exception as error:
            failures.append({'module':name,'error':type(error).__name__+': '+clean(error)}); continue
        scanned.append(name)
        for export, value in vars(module).items():
            if export.startswith('_'): continue
            owner = getattr(value,'__module__','')
            if (inspect.isclass(value) or inspect.isfunction(value)) and owner.startswith('manim'):
                canonical = owner+'.'+value.__qualname__
                objects[canonical]=value
            elif name in ('manim','manim.constants') or 'color' in name:
                try:
                    data=literal(value)
                    # Do not copy huge color-map dictionaries or arbitrary module state.
                    if len(json.dumps(data))>1200: continue
                    key=export if name=='manim' else name+'.'+export
                    constants[key]={'module':name,'path':export,'preview':data}
                except (TypeError,ValueError,RecursionError):
                    if name=='manim' and type(value).__module__.startswith('manim') and not inspect.isclass(value):
                        constants[export]={'module':name,'path':export,'preview':type(value).__name__,'requiresTrust':True}
    entries={}
    def add(cid, obj, kind, module, path, owner=None):
        ps,sig=parameters(obj,kind in ('method','classmethod')) if kind!='property' else ([],None)
        result_kind=kind_of(obj) if kind=='class' else 'value'
        if kind!='class' and kind!='property':
            try:
                ann=str(inspect.signature(obj).return_annotation).strip("'\"")
                if ann in vars(manim) and inspect.isclass(getattr(manim,ann)): result_kind=kind_of(getattr(manim,ann))
                elif ann=='Self' and owner:
                    owner_obj=objects.get(owner)
                    if owner_obj is not None: result_kind=kind_of(owner_obj)
            except (TypeError,ValueError): pass
        doc=(inspect.getdoc(obj) or '').split('\n\n')[0]
        doc=re.sub(r'\s+',' ',doc)[:350]
        entry={'id':cid,'type':'api_'+hashlib.sha256(cid.encode()).hexdigest()[:16],
               'name':path.split('.')[-1],'kind':kind,'module':module,'path':path,'owner':owner,
               'parameters':ps,'signature':sig,'description':doc,'category':category(module),
               'resultKind':result_kind,'requiresTrust':risky(module,path.split('.')[-1],result_kind),
               'renderer':'opengl' if 'opengl' in module else 'any',
               'writable':False,'inheritedParameters':[]}
        if kind=='class':
            entry['bases']=[b.__module__+'.'+b.__qualname__ for b in obj.__mro__[1:] if b.__module__.startswith('manim')]
            if any(p['kind']=='var_keyword' for p in ps):
                seen={p['name'] for p in ps}
                consumed=consumed_parent_parameters(obj)
                for base in obj.__mro__[1:]:
                    if not base.__module__.startswith('manim'): continue
                    more,_=parameters(base,False)
                    for p in more:
                        if p['name'] not in seen and p['name'] not in consumed.get(base,set()) and p['kind'] not in ('var_keyword','var_positional','positional_only'):
                            entry['inheritedParameters'].append({**p,'required':False,'inheritedFrom':base.__qualname__})
                            seen.add(p['name'])
        if kind=='property':
            entry['writable']=obj.fset is not None if isinstance(obj,property) else hasattr(obj,'__set__')
            if isinstance(obj,property) and obj.fset: entry['setterParameters'],_=parameters(obj.fset,True)
        entries[cid]=entry
    for cid,obj in sorted(objects.items()):
        add(cid,obj,'class' if inspect.isclass(obj) else 'function',obj.__module__,obj.__qualname__)
        if inspect.isclass(obj):
            visible={}
            for base in obj.__mro__:
                for name,value in vars(base).items(): visible.setdefault(name,(base,value))
            for name,(base,value) in sorted(visible.items()):
                if name.startswith('_') or not base.__module__.startswith('manim'): continue
                member_id=base.__module__+'.'+base.__qualname__+'.'+name
                if member_id in entries: continue
                kind=None; target=value
                if isinstance(value,property) or inspect.isdatadescriptor(value):kind='property'
                elif isinstance(value,staticmethod):kind='staticmethod';target=value.__func__
                elif isinstance(value,classmethod):kind='classmethod';target=value.__func__
                elif inspect.isfunction(value):kind='method'
                if kind: add(member_id,target if kind!='property' else value,kind,base.__module__,base.__qualname__+'.'+name,base.__module__+'.'+base.__qualname__)
                elif not inspect.isclass(value):
                    try:
                        preview=literal(value)
                        if len(json.dumps(preview))>1200: continue
                        constants[member_id]={'module':base.__module__,'path':base.__qualname__+'.'+name,'preview':preview}
                    except (TypeError,ValueError,RecursionError):
                        if type(value).__module__.startswith('manim'):
                            constants[member_id]={'module':base.__module__,'path':base.__qualname__+'.'+name,'preview':type(value).__name__,'requiresTrust':True}
            if issubclass(obj,enum.Enum):
                for name in obj.__members__:
                    constants[cid+'.'+name]={'module':obj.__module__,'path':obj.__qualname__+'.'+name,'preview':name}
    return {'schemaVersion':1,'engineVersion':manim.__version__,
            'scope':{'modules':scanned,'excluded':['CLI entry points','Sphinx documentation-build helpers','private names','dynamic runtime-only attributes'], 'unavailableModules':failures},
            'aliases':{name:value.__module__+'.'+value.__qualname__ for name,value in vars(manim).items() if not name.startswith('_') and (inspect.isclass(value) or inspect.isfunction(value)) and value.__module__+'.'+value.__qualname__ in entries},
            'entries':sorted(entries.values(),key=lambda e:e['id']),
            'constants':dict(sorted(constants.items()))}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='src/studio/core/api-registry.json');parser.add_argument('--check',action='store_true');args=parser.parse_args()
    data=generate();content=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n';p=ROOT/args.output
    if args.check:
        if not p.exists() or p.read_text()!=content: sys.exit('API registry differs; regenerate using the pinned Manim environment.')
    else:p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
    print(json.dumps({'version':data['engineVersion'],'entries':len(data['entries']),'constants':len(data['constants']),'unavailableModules':data['scope']['unavailableModules'],'bytes':len(content.encode())},ensure_ascii=False,indent=2))
