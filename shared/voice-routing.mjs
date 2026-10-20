/** Route a synchronized full-length voice recording without losing source time. */
export function routeSourceVoice(state, selectedId) {
  const selected = state.clips.find(c => c.id === selectedId);
  if (!selected?.mediaId) throw Error('请先选择一个口播素材片段');
  const voice = selected.voiceId && state.media.find(m => m.id === selected.voiceId);
  if (selected.voiceId && !voice?.hasAudio) throw Error('配音素材不可用');
  const offset = (selected.voiceStart || 0) - selected.start;
  let count = 0;
  const clips = state.clips.map(c => {
    if (c.mediaId !== selected.mediaId) return { ...c };
    count++;
    if (!voice) {
      const { voiceId, voiceStart, ...original } = c;
      return original;
    }
    const start = Math.round((c.start + offset) * 1000000) / 1000000;
    if (start < 0 || start + c.end - c.start > voice.duration + .03)
      throw Error('整条配音无法覆盖同源全部片段，请调整配音起点或选择完整音频；原工程未改动');
    return { ...c, voiceId: voice.id, voiceStart: start };
  });
  return { clips, count };
}
