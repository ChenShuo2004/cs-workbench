#!/bin/sh
set -eu
asr_dir="$HOME/.local/share/cs-workbench/asr"
uv venv --python 3.12 "$asr_dir"
uv pip install --python "$asr_dir/bin/python" 'faster-whisper==1.2.1' 'opencc-python-reimplemented==0.1.7'
"$asr_dir/bin/python" -c "from faster_whisper import WhisperModel; from pathlib import Path; WhisperModel('base',device='cpu',compute_type='int8',download_root=str(Path.home()/'.local/share/cs-workbench/models')); print('本地语音转写已就绪')"
