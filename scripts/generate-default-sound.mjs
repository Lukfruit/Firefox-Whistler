import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outputPath = resolve("public/sounds/default-whistle.wav");
const sampleRate = 44_100;
const durationSeconds = 0.9;
const sampleCount = Math.floor(sampleRate * durationSeconds);
const dataSize = sampleCount * 2;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(dataSize, 40);

for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  const attack = Math.min(1, time / 0.035);
  const release = Math.min(1, (durationSeconds - time) / 0.16);
  const envelope = Math.max(0, Math.min(attack, release));
  const frequency = 1120 + 180 * Math.sin(Math.PI * time / durationSeconds);
  const fundamental = Math.sin(2 * Math.PI * frequency * time);
  const overtone = 0.24 * Math.sin(2 * Math.PI * frequency * 2 * time);
  const vibrato = 0.9 + 0.1 * Math.sin(2 * Math.PI * 6 * time);
  const sample = Math.max(-1, Math.min(1, (fundamental + overtone) * envelope * vibrato * 0.35));
  buffer.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, buffer);
