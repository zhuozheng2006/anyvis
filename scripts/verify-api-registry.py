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
EVIDENCE_SOURCES={
    'package-lock.json',
    'src/studio/core/api-compiler.ts', 'src/studio/core/api-values.ts',
    'src/studio/core/compiler.ts', 'src/studio/core/expression.ts',
    'src/studio/core/api-catalog.ts', 'src/studio/core/api-registry.ts',
    'src/studio/core/catalog.ts', 'src/studio/core/project.ts', 'src/studio/core/assets.ts',
    'src/studio/core/piano.ts',
}
EVIDENCE_FIXTURES={'src/studio/core/api.native.spec-node.mjs', 'src/studio/core/api-families.native.spec-node.mjs', 'src/studio/core/api-queries.native.spec-node.mjs', 'src/studio/core/api-utilities.native.spec-node.mjs', 'src/studio/core/api-mutations.native.spec-node.mjs', 'src/studio/core/api-config.native.spec-node.mjs', 'src/studio/core/api-raster.native.spec-node.mjs'}

def validate_native_evidence(native, registry_hash, ids, version, root=ROOT):
    errors=[]
    if native.get('passed') is not True: errors.append('Native suite did not pass completely.')
    if native.get('engineVersion')!=version: errors.append('Native evidence engine version mismatch.')
    if native.get('registrySha256')!=registry_hash: errors.append('Registry changed after native behavior tests.')
    api_ids=native.get('apiIds')
    if not isinstance(api_ids,list) or not all(isinstance(item,str) for item in api_ids) or not set(api_ids).issubset(ids):
        errors.append('Unknown or malformed API IDs in evidence.')
    fixture=native.get('fixture')
    if fixture not in EVIDENCE_FIXTURES: errors.append('Unrecognized evidence fixture.')
    sources=native.get('sourceFiles',{})
    expected=EVIDENCE_SOURCES|({fixture} if fixture in EVIDENCE_FIXTURES else set())
    if not isinstance(sources,dict) or set(sources)!=expected:
        errors.append('Incomplete compiler/fixture source fingerprint.')
    else:
        for file in sorted(expected):
            if sources[file]!=hashlib.sha256((root/file).read_bytes()).hexdigest():
                errors.append(f'Source changed after native tests: {file}')
    if native.get('renderer') not in ('cairo','opengl'): errors.append('Unknown evidence renderer.')
    return errors

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default='docs/research/api-registry-verification.json')
    parser.add_argument('--native-report', action='append', default=[])
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
    native_reports=[]; verified_ids=set()
    for filename in args.native_report:
        native=json.loads((ROOT/filename).read_text())
        errors=validate_native_evidence(native,hashlib.sha256(path.read_bytes()).hexdigest(),ids,manim.__version__)
        failures.extend({'id':'native-evidence','report':str(filename),'error':error} for error in errors)
        if not errors:
            native_reports.append(native); verified_ids.update(native['apiIds'])
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
        'nativeBehaviorEvidence':{'apiIds':sorted(verified_ids),'reports':native_reports},
        'entriesWithBehaviorEvidence':len(verified_ids),
        'entriesWithoutBehaviorEvidence':sorted(ids-verified_ids),
        'failures':failures,
        'interpretation':'All entries have blocks and structured argument inputs. Static resolution and signature checks are not per-API render or complete parameter-combination coverage.'}
    output=ROOT/args.output;output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ('entryCount','resolvedEntries','verifiedSignatures','parameterFields','properties','writableProperties','constants','resolvedConstants','previousBoundedInventory','previousInventoryMissing','entriesWithBehaviorEvidence','failures')},ensure_ascii=False,indent=2))
    return 1 if failures or missing or manim.__version__!=data['engineVersion'] else 0

if __name__=='__main__':sys.exit(main())
