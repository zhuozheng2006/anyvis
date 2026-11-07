#!/usr/bin/env python3
"""Verify static API resolution independently of the registry generator.

This is not a claim that arbitrary argument combinations are render-tested.
Native behavior evidence is supplied by the separate Manim integration test.
"""
import argparse
import collections
import gzip
import hashlib
import importlib
import inspect
import json
from pathlib import Path
import sys
import manim

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default='docs/research/api-registry-verification.json')
    parser.add_argument('--native-report')
    args=parser.parse_args()
    path=ROOT/'src/studio/core/api-registry.json'
    data=json.loads(path.read_text())
    failures=[]; signatures=0; resolved=0
    for entry in data['entries']:
        try:
            obj=importlib.import_module(entry['module'])
            for part in entry['path'].split('.'):
                obj=inspect.getattr_static(obj,part) if entry['kind']=='property' else getattr(obj,part)
            if entry['kind']=='property':
                assert isinstance(obj,property) or inspect.isdatadescriptor(obj)
                assert (obj.fset is not None if isinstance(obj,property) else hasattr(obj,'__set__'))==entry['writable']
            else:
                assert callable(obj)
                if entry['signature'] is not None:
                    actual=list(inspect.signature(obj).parameters.values())
                    if entry['kind']=='method': actual=[p for p in actual if p.name not in ('self','cls')]
                    expected=[(p['name'],p['kind'],p['required']) for p in entry['parameters']]
                    observed=[(p.name,p.kind.name.lower(),p.default is p.empty and p.kind not in (p.VAR_POSITIONAL,p.VAR_KEYWORD)) for p in actual]
                    assert expected==observed, (expected,observed)
                    signatures+=1
            resolved+=1
        except Exception as error:
            failures.append({'id':entry['id'],'error':str(error)[:500]})
    constants=0
    for key,entry in data['constants'].items():
        try:
            obj=importlib.import_module(entry['module'])
            for part in entry['path'].split('.'): obj=getattr(obj,part)
            constants+=1
        except Exception as error: failures.append({'id':key,'error':str(error)[:500]})
    old=json.loads(gzip.decompress((ROOT/'docs/research/manim-ce-0.20.1-coverage.json.gz').read_bytes()))
    ids={e['id'] for e in data['entries']}
    missing=[e['id'] for e in old['api_entries'] if e['id'] not in ids]
    native=None
    if args.native_report:
        native=json.loads((ROOT/args.native_report).read_text())
        if native['registrySha256']!=hashlib.sha256(path.read_bytes()).hexdigest():
            failures.append({'id':'native-evidence','error':'Registry changed after native behavior tests.'})
        if not set(native['apiIds']).issubset(ids): failures.append({'id':'native-evidence','error':'Unknown API in evidence.'})
    report={
        'engineVersion':manim.__version__,'registryVersion':data['engineVersion'],
        'registrySha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'entryCount':len(data['entries']),'byKind':dict(collections.Counter(e['kind'] for e in data['entries'])),
        'resolvedEntries':resolved,'verifiedSignatures':signatures,
        'signatureUnavailable':[e['id'] for e in data['entries'] if e['kind']!='property' and e['signature'] is None],
        'parameterFields':sum(len(e['parameters'])+len(e['inheritedParameters']) for e in data['entries']),
        'properties':sum(e['kind']=='property' for e in data['entries']),
        'writableProperties':sum(e['kind']=='property' and e['writable'] for e in data['entries']),
        'constants':len(data['constants']),'resolvedConstants':constants,
        'previousBoundedInventory':len(old['api_entries']),'previousInventoryMissing':missing,
        'renderer':{'cairoOrSharedEntries':sum(e['renderer']=='any' for e in data['entries']),'openGLSpecificEntries':sum(e['renderer']=='opengl' for e in data['entries']),
                    'openGLBehaviorVerified':False,'openGLLocalBlocker':"glcontext cannot import egl on this macOS Manim installation"},
        'unavailableModules':data['scope']['unavailableModules'],'excluded':data['scope']['excluded'],
        'nativeBehaviorEvidence':native,'failures':failures,
        'interpretation':'All entries have blocks and structured argument inputs. Static resolution and signature checks are not per-API render or complete parameter-combination coverage.'}
    output=ROOT/args.output;output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ('entryCount','resolvedEntries','verifiedSignatures','parameterFields','properties','writableProperties','constants','resolvedConstants','previousBoundedInventory','previousInventoryMissing','failures')},ensure_ascii=False,indent=2))
    return 1 if failures or missing or manim.__version__!=data['engineVersion'] else 0

if __name__=='__main__':sys.exit(main())
