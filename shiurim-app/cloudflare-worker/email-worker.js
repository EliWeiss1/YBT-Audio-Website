export default {
  async email(message, env, ctx) {
    const chunks = []
    const reader = message.raw.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const merged = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    const response = await fetch(env.INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'message/rfc822',
        'X-Ingest-Secret': env.INGEST_SECRET,
      },
      body: merged,
    })

    if (!response.ok) {
      console.error('Ingest failed:', response.status, await response.text())
    }
  },
}
