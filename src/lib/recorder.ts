// Microphone recording with MediaRecorder. iOS Safari records audio/mp4;
// Chrome records webm/opus. The blob is stored as-is in Dexie and played back
// through an <audio> element, so the container does not matter to the app.

export interface ActiveRecording {
  stop: () => Promise<Blob>
  mimeType: string
}

export function recordingAvailable(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

function pickMime(): string {
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

/** Asks for the microphone (first time only) and starts recording. */
export async function startRecording(): Promise<ActiveRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickMime()
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: BlobPart[] = []
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      for (const t of stream.getTracks()) t.stop()
      resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }))
    }
  })
  rec.start()
  return {
    mimeType: rec.mimeType || mimeType,
    stop: () => {
      if (rec.state !== 'inactive') rec.stop()
      return stopped
    },
  }
}
