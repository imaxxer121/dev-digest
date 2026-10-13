import { request } from 'node:http';

/** Buffered loopback transport with the caller's deadline, including delayed headers. */
export const fetchOllamaLoopback: typeof fetch = async (input, init) => {
  if (input !== 'http://127.0.0.1:11434/api/chat' || init?.method !== 'POST' || typeof init.body !== 'string') {
    throw new Error('CI Ollama transport accepts only the fixed loopback chat endpoint');
  }
  return new Promise<Response>((resolve, reject) => {
    const req = request(input, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: init.signal ?? undefined,
    }, res => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1_048_576) {
          const error = new Error('CI Ollama response exceeds the 1 MiB limit');
          reject(error);
          res.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('CI Ollama response was aborted')));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks).toString('utf8'), { status: res.statusCode ?? 500 })));
    });
    req.on('error', reject);
    req.end(init.body);
  });
};
