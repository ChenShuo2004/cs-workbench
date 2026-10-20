"""Local-only ASR worker. Produces source-media timestamps, never estimated alignment."""
import argparse, json, os, sys, subprocess, shutil
import numpy as np
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('output');p.add_argument('--model',default='base');p.add_argument('--language',default='zh');args=p.parse_args()
from faster_whisper import WhisperModel
from opencc import OpenCC
converter=OpenCC("t2s")
cache=Path.home()/'.local/share/cs-workbench/models';cache.mkdir(parents=True,exist_ok=True)
model=WhisperModel(args.model,device='cpu',compute_type='int8',download_root=str(cache))
ffmpeg=shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'
raw=subprocess.run([ffmpeg,'-v','error','-nostdin','-i',args.source,'-f','f32le','-ac','1','-ar','16000','-'],check=True,stdout=subprocess.PIPE).stdout
audio=np.frombuffer(raw,dtype=np.float32)
segments,info=model.transcribe(audio,language=args.language or None,beam_size=5,vad_filter=True,word_timestamps=True,condition_on_previous_text=False)
result=[]
for segment in segments:
    if segment.end-segment.start<.08 or not segment.text.strip():continue
    group=[]
    for word in segment.words or []:
        group.append(word)
        phrase=''.join(w.word for w in group).strip()
        if len(phrase)>=22 or any(phrase.endswith(c) for c in '，。？！,.!?;；'):
            if group[-1].end-group[0].start>=.08:
                result.append({'start':group[0].start,'end':group[-1].end,'text':converter.convert(phrase)})
                group=[]
    if group:
        result.append({'start':group[0].start,'end':group[-1].end,'text':converter.convert(''.join(w.word for w in group).strip())})
    elif not segment.words:
        result.append({'start':segment.start,'end':segment.end,'text':converter.convert(segment.text.strip())})
    print(json.dumps({'progress':min(99,round(segment.end/max(info.duration,.01)*100))}),flush=True)
Path(args.output).write_text(json.dumps({'language':info.language,'duration':info.duration,'segments':result},ensure_ascii=False),encoding='utf-8')
