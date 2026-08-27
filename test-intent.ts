import { classifyIntent } from './src/lib/chat-router';
async function run() {
  const intent = await classifyIntent("orientaciones academicas doc specifically for seminario de tesis is not being found by the ai", "");
  console.log("Preloaded chars:", intent.preloadedContent.length);
}
run();
