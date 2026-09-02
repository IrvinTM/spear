import { generateAudio } from './src/lib/tts';

async function run() {
  try {
    const res = await generateAudio("Hola");
    console.log("Success", res.buffer.length);
  } catch (e) {
    console.error("Error", e);
  }
}
run();
