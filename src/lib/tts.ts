import { spawn } from 'child_process';

const PIPER_PATH = '/home/irvin/.local/share/piper/piper';
const MODEL_PATH = '/home/irvin/.local/share/piper/es_AR-daniela-high.onnx';

export async function generateAudio(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(PIPER_PATH, [
      '--model', MODEL_PATH,
      '--output_file', '-'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const chunks: Buffer[] = [];
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderr}`));
      } else {
        // Since --output_raw gives raw PCM data, we'll wrap it in a WAV later or just use --output_file -?
        // Wait, if we use --output-file - or omit output_raw, it outputs standard WAV to stdout!
        resolve(Buffer.concat(chunks));
      }
    });

    // Strip markdown symbols and newlines so Piper reads smoothly
    let cleanText = text.replace(/[\*\#\_\[\]\(\)]/g, '');
    cleanText = cleanText.replace(/\n/g, ' ').trim();
    
    child.stdin.write(cleanText + '\n');
    child.stdin.end();
  });
}
