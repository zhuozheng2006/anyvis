#!/usr/bin/env python3
"""Losslessly assemble AnyVis worker outputs, then decode every output frame."""
import argparse
from fractions import Fraction
from pathlib import Path
import hashlib
import json
import av

parser=argparse.ArgumentParser()
parser.add_argument('--report',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args()
report=json.loads(Path(args.report).read_text())
results=sorted(report['results'],key=lambda x:x['index'])
if not results or [r['index'] for r in results]!=list(range(len(results))):
    raise ValueError('Missing or duplicated render results; refusing an incomplete film.')
files=[Path(r['folder'])/r['media']['filename'] for r in results]
output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
with av.open(str(files[0])) as first:
    original=first.streams.video[0]
    signature=(original.width,original.height,original.average_rate,original.codec_context.name)
    with av.open(str(output),'w',options={'movflags':'+faststart'}) as target:
        stream=target.add_stream_from_template(original)
        stream.metadata['title']='AnyVis · Geometry and Topology'
        offset=Fraction(0)
        for index,filename in enumerate(files):
            with av.open(str(filename)) as source:
                video=source.streams.video[0]
                if (video.width,video.height,video.average_rate,video.codec_context.name)!=signature:
                    raise ValueError(f'Incompatible clip: {filename}')
                if video.duration is None: raise ValueError(f'Missing duration: {filename}')
                duration=video.duration*video.time_base
                expected_duration=Fraction(str(results[index]['expectedDuration']))
                if abs(float(duration-expected_duration))>1.01/float(video.average_rate):
                    raise ValueError(f'Unexpected clip duration: {filename}')
                for packet in source.demux(video):
                    if packet.dts is None: continue
                    # Cairo may emit one trailing rounding frame; trim to the authored shot boundary.
                    if packet.pts*packet.time_base >= expected_duration: continue
                    delta=round(offset/packet.time_base)
                    packet.pts+=delta;packet.dts+=delta;packet.stream=stream
                    target.mux(packet)
                offset+=expected_duration
            print(f'Joined {index+1}/{len(files)}',flush=True)
count=0;previous=-1;sample_hashes={}
with av.open(str(output)) as c:
    v=c.streams.video[0]
    for frame in c.decode(v):
        if frame.time is None or frame.time<=previous: raise ValueError('Non-increasing presentation timestamp')
        previous=frame.time
        if count% (24*25)==24*8:
            sample_hashes[str(count)]=hashlib.sha256(frame.to_ndarray(format='rgb24').tobytes()).hexdigest()
        count+=1
    duration=float(v.duration*v.time_base)
    result={'file':output.name,'width':v.width,'height':v.height,'fps':str(v.average_rate),'codec':v.codec_context.name,'durationSeconds':duration,'decodedFrames':count,'clips':len(files),'allFramesDecoded':True,'monotonicTimestamps':True,'sampleFrameSha256':sample_hashes}
expected=round(sum(r['expectedDuration'] for r in results)*float(signature[2]))
if count!=expected:raise ValueError(f'Expected {expected} frames, decoded {count}')
result['sha256']=hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='sampleFrameSha256'},indent=2))
