import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_MAX_INPUT_BYTES, MAX_INPUT_BYTES } from '../src/constants.js';
import { ensureBuffer, parse, validateBuffer } from '../src/index.js';
import { setHeaderField } from '../src/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sectionRegex = /^##\s*(.+?)\s*\r?\n```[\s\S]*?\r?\n([\s\S]+?)\r?\n```/gm;

test('MAX_INPUT_BYTES defaults to 100MB', () => {
  assert.equal(MAX_INPUT_BYTES, DEFAULT_MAX_INPUT_BYTES);
});

test('MAX_INPUT_BYTES honours override', async () => {
  const script = [
    "process.env.INGESTION_MAX_INPUT_BYTES = '1048577';",
    "const module = await import('./src/constants.js');",
    "console.log(module.MAX_INPUT_BYTES);"
  ].join('\n');

  const { stdout } = await new Promise((resolve, reject) => {
    execFile(
      'node',
      ['--input-type=module', '-e', script],
      { cwd: join(__dirname, '..') },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stderr }));
          return;
        }
        resolve({ stdout });
      }
    );
  });

  const cleaned = stdout.replace(/\u001b\[[0-9;]*m/g, '').trim();
  assert.equal(cleaned, '1048577');
});

test('section regex extracts headings', () => {
  const fixture = [
    '##  Sample Section  \n',
    '```\n',
    'header: value\n',
    '```\n',
    '',
    '##Another\r\n',
    '```\r\n',
    'key:other\r\n',
    '```\r\n'
  ].join('');

  const matches = [...fixture.matchAll(sectionRegex)];
  assert.equal(matches.length, 2);
  assert.equal(matches[0][1], 'Sample Section');
  assert.equal(matches[1][1], 'Another');
});

test('ensureBuffer converts string input', () => {
  const buf = ensureBuffer('hello');
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.toString('utf8'), 'hello');
});

test('validateBuffer enforces bounds', () => {
  assert.throws(() => validateBuffer(Buffer.alloc(0)), /empty buffer/);
  assert.throws(() => validateBuffer(Buffer.alloc(MAX_INPUT_BYTES + 1)), /Input file too large/);
});

test('parse delegates to parser', () => {
  const result = parse('hello', (buf) => buf.toString('utf8').toUpperCase());
  assert.equal(result, 'HELLO');
});

test('setHeaderField applies known keys', () => {
  const header = { title: '', category: '', reference: '' };
  setHeaderField(header, 'title', '  Example ');
  setHeaderField(header, 'reference', ' ref ');
  setHeaderField(header, 'missing', 'ignored');
  assert.equal(header.title, 'Example');
  assert.equal(header.reference, 'ref');
});
