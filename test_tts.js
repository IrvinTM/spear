const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

let piperPath = 'piper';
let modelPath = 'es_ES-carlfm-x_low.onnx';

const piperDir = path.join(os.homedir(), '.local', 'share', 'piper');

if (!path.isAbsolute(modelPath) && !modelPath.includes('/')) {
  modelPath = path.join(piperDir, modelPath);
}
if (!path.isAbsolute(piperPath) && !piperPath.includes('/')) {
  piperPath = path.join(piperDir, piperPath);
}

console.log("PIPER PATH:", piperPath);
console.log("MODEL PATH:", modelPath);

const child = spawn(piperPath, [
  '--model', modelPath,
  '--output_file', '-'
], { stdio: ['pipe', 'pipe', 'pipe'] });

let stderr = '';
child.stderr.on('data', d => stderr += d.toString());
child.on('close', code => console.log('code:', code, 'stderr:', stderr));
child.stdin.write('Hola Mundo\n');
child.stdin.end();
