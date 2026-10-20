const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fsPromises = require('node:fs/promises');
const { createRestImageService } = require('../desktop/rest-image.cjs');

function png(width, height, suffix = Buffer.alloc(0)) {
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header, 0);
  header.write('IHDR', 12, 'ascii'); header.writeUInt32BE(width, 16); header.writeUInt32BE(height, 20);
  return Buffer.concat([header, suffix]);
}

function webp(width, height, format = 'VP8X') {
  let payload;
  if (format === 'VP8X') {
    payload = Buffer.alloc(10);
    const w = width - 1, h = height - 1;
    payload[4] = w & 0xff; payload[5] = (w >> 8) & 0xff; payload[6] = (w >> 16) & 0xff;
    payload[7] = h & 0xff; payload[8] = (h >> 8) & 0xff; payload[9] = (h >> 16) & 0xff;
  } else if (format === 'VP8L') {
    const w = width - 1, h = height - 1;
    payload = Buffer.from([0x2f, w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x03) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f]);
  } else {
    payload = Buffer.alloc(10); payload[3] = 0x9d; payload[4] = 0x01; payload[5] = 0x2a;
    payload.writeUInt16LE(width, 6); payload.writeUInt16LE(height, 8);
  }
  const paddedLength = payload.length + (payload.length & 1);
  const bytes = Buffer.alloc(12 + 8 + paddedLength);
  bytes.write('RIFF', 0, 'ascii'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WEBP', 8, 'ascii');
  bytes.write(format === 'VP8 ' ? 'VP8 ' : format, 12, 'ascii'); bytes.writeUInt32LE(payload.length, 16); payload.copy(bytes, 20);
  return bytes;
}

function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tomatoclock-rest-image-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const configDir = path.join(dir, 'config');
  const source = path.join(dir, 'picked.webp');
  fs.writeFileSync(source, webp(100, 50));
  const dialog = { showOpenDialog: options.showOpenDialog ?? (async () => ({ canceled: false, filePaths: [source] })) };
  const nativeImage = options.nativeImage ?? { createFromBuffer: () => ({
    isEmpty: () => false,
    getSize: () => ({ width: 100, height: 50 }),
    toPNG: () => png(100, 50, Buffer.from('converted-png'))
  }) };
  return { dir, configDir, source, dialog, nativeImage, service: createRestImageService({ configDir, dialog, window: {}, nativeImage }) };
}

test('missing state reads as default without creating config files; selection persists one managed PNG state', async t => {
  const f = fixture(t);
  assert.deepEqual(await f.service.get(), { dataUrl: null, custom: false });
  assert.equal(fs.existsSync(f.configDir), false);
  const chosen = await f.service.choose();
  assert.deepEqual(chosen, { dataUrl: `data:image/png;base64,${png(100, 50, Buffer.from('converted-png')).toString('base64')}`, custom: true, name: 'picked.png' });
  assert.deepEqual(await f.service.get(), chosen);
  assert.equal(fs.readdirSync(f.configDir).filter(name => name.endsWith('.tmp')).length, 0);
});

test('cancel, invalid decoder result, and decode errors preserve an existing managed selection', async t => {
  const f = fixture(t);
  const original = await f.service.choose();
  f.dialog.showOpenDialog = async () => ({ canceled: true });
  assert.deepEqual(await f.service.choose(), { canceled: true });
  assert.deepEqual(await f.service.get(), original);
  const pngPath = path.join(f.dir, 'picked.png'); fs.writeFileSync(pngPath, png(50, 40));
  f.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pngPath] });
  f.nativeImage.createFromBuffer = () => ({ isEmpty: () => true });
  await assert.rejects(f.service.choose(), /有效的/);
  assert.deepEqual(await f.service.get(), original);
  f.nativeImage.createFromBuffer = () => { throw new Error('decode failure'); };
  await assert.rejects(f.service.choose(), /无法读取/);
  assert.deepEqual(await f.service.get(), original);
});

test('oversized source, unsupported extensions, and excessive pixel dimensions are rejected', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.source, Buffer.alloc(16 * 1024 * 1024 + 1));
  await assert.rejects(f.service.choose(), /过大/);
  fs.writeFileSync(f.source, webp(100, 50));
  const svg = path.join(f.dir, 'picked.svg'); fs.writeFileSync(svg, '<svg/>');
  f.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [svg] });
  await assert.rejects(f.service.choose(), /仅支持/);
  f.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f.source] });
  f.nativeImage.createFromBuffer = () => ({ isEmpty: () => false, getSize: () => ({ width: 8000, height: 5000 }) });
  await assert.rejects(f.service.choose(), /3200 万像素/);
  assert.equal(fs.existsSync(f.configDir), false);
});

test('large valid image is resized within 2048 pixels before PNG persistence', async t => {
  const f = fixture(t);
  let resizeArgs;
  f.nativeImage.createFromBuffer = () => ({
    isEmpty: () => false, getSize: () => ({ width: 4096, height: 2048 }),
    resize: args => { resizeArgs = args; return { toPNG: () => png(2048, 1024, Buffer.from('resized')) }; }
  });
  const result = await f.service.choose();
  assert.deepEqual(resizeArgs, { width: 2048, height: 1024, quality: 'good' });
  assert.equal(result.dataUrl, `data:image/png;base64,${png(2048, 1024, Buffer.from('resized')).toString('base64')}`);
});

test('reset updates managed state but refuses unknown files and symlinks without changing them', async t => {
  const f = fixture(t);
  await f.service.choose();
  assert.deepEqual(await f.service.reset(), { dataUrl: null, custom: false });
  assert.deepEqual(await f.service.get(), { dataUrl: null, custom: false });
  const file = path.join(f.configDir, 'rest-image.json');
  fs.writeFileSync(file, 'user data');
  await assert.rejects(f.service.reset());
  assert.equal(fs.readFileSync(file, 'utf8'), 'user data');
  fs.unlinkSync(file);
  const outside = path.join(f.dir, 'outside.json'); fs.writeFileSync(outside, 'keep');
  fs.symlinkSync(outside, file);
  await assert.rejects(f.service.reset());
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
});

test('failed conversion and staged write preserve the old selection', async t => {
  const f = fixture(t);
  const original = await f.service.choose();
  f.nativeImage.createFromBuffer = () => ({ isEmpty: () => false, getSize: () => ({ width: 2, height: 2 }), toPNG: () => Buffer.concat([png(2, 2), Buffer.alloc(20 * 1024 * 1024)]) });
  await assert.rejects(f.service.choose(), /转换后的图片过大/);
  assert.deepEqual(await f.service.get(), original);
});

test('renamed SVG payload is rejected before decoding, and oversized PNG dimensions are rejected from its header', async t => {
  const f = fixture(t);
  let decodes = 0;
  f.nativeImage.createFromBuffer = () => { decodes++; throw new Error('must not decode'); };
  fs.writeFileSync(f.source, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await assert.rejects(f.service.choose(), /内容不是/);
  assert.equal(decodes, 0);
  fs.writeFileSync(f.source, png(8000, 5000));
  const pngPath = path.join(f.dir, 'picked.png'); fs.copyFileSync(f.source, pngPath);
  f.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pngPath] });
  await assert.rejects(f.service.choose(), /3200 万像素/);
  assert.equal(decodes, 0);
});

test('rename failure leaves old managed JSON intact and removes the staged temp file', async t => {
  const f = fixture(t);
  const original = await f.service.choose();
  const file = path.join(f.configDir, 'rest-image.json');
  const originalBytes = fs.readFileSync(file);
  const originalRename = fsPromises.rename;
  f.nativeImage.createFromBuffer = () => ({ isEmpty: () => false, getSize: () => ({ width: 10, height: 10 }), toPNG: () => png(10, 10, Buffer.from('new')) });
  try {
    fsPromises.rename = async () => { throw Object.assign(new Error('staged rename failure'), { code: 'EIO' }); };
    await assert.rejects(f.service.choose(), /staged rename failure/);
  } finally { fsPromises.rename = originalRename; }
  assert.deepEqual(fs.readFileSync(file), originalBytes);
  assert.deepEqual(await f.service.get(), original);
  assert.deepEqual(fs.readdirSync(f.configDir), ['rest-image.json']);
});

test('first-create link race preserves a destination file that appears after ownership check', async t => {
  const f = fixture(t);
  const originalLink = fsPromises.link;
  try {
    fsPromises.link = async (source, destination) => {
      fs.writeFileSync(destination, 'appeared during publication');
      return originalLink(source, destination);
    };
    await assert.rejects(f.service.choose(), error => error.code === 'EEXIST');
  } finally { fsPromises.link = originalLink; }
  const file = path.join(f.configDir, 'rest-image.json');
  assert.equal(fs.readFileSync(file, 'utf8'), 'appeared during publication');
  assert.deepEqual(fs.readdirSync(f.configDir), ['rest-image.json']);
});

test('maximum stored PNG round-trips through the larger Base64 JSON envelope; relative picker paths are rejected', async t => {
  const f = fixture(t);
  f.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: ['relative.webp'] });
  await assert.rejects(f.service.choose(), /路径无效/);
  assert.equal(fs.existsSync(f.configDir), false);
  f.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f.source] });
  const fullPng = Buffer.alloc(20 * 1024 * 1024);
  png(2048, 2048).copy(fullPng);
  f.nativeImage.createFromBuffer = () => ({ isEmpty: () => false, getSize: () => ({ width: 2048, height: 2048 }), toPNG: () => fullPng });
  const selected = await f.service.choose();
  assert.equal(Buffer.from(selected.dataUrl.slice('data:image/png;base64,'.length), 'base64').length, 20 * 1024 * 1024);
  assert.deepEqual(await f.service.get(), selected);
});

test('unsupported native WebP decode returns an unpersisted token and valid renderer PNG finish persists once', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.source, webp(3000, 2000));
  f.nativeImage.createFromBuffer = buffer => {
    if (buffer.toString('ascii', 8, 12) === 'WEBP') return { isEmpty: () => true };
    return { isEmpty: () => false, getSize: () => ({ width: 1200, height: 800 }), toPNG: () => png(1200, 800, Buffer.from('sanitized')) };
  };
  const pending = await f.service.choose();
  assert.equal(pending.needsDecode, true);
  assert.equal(pending.dataUrl, `data:image/webp;base64,${webp(3000, 2000).toString('base64')}`);
  assert.equal(fs.existsSync(f.configDir), false);
  assert.deepEqual(await f.service.get(), { dataUrl: null, custom: false });
  await assert.rejects(f.service.finish({ token: 'wrong', dataUrl: `data:image/png;base64,${png(1200, 800).toString('base64')}` }), /失效/);
  const saved = await f.service.finish({ token: pending.token, dataUrl: `data:image/png;base64,${png(1200, 800).toString('base64')}` });
  assert.equal(saved.custom, true);
  assert.equal(saved.name, 'picked.png');
  assert.deepEqual(await f.service.get(), saved);
  await assert.rejects(f.service.finish({ token: pending.token, dataUrl: `data:image/png;base64,${png(1200, 800).toString('base64')}` }), /失效/);
  assert.deepEqual(await f.service.get(), saved);
});

test('WebP fallback rejects excess dimensions, invalid PNG data, and tokens invalidated by reset or another choice', async t => {
  const f = fixture(t);
  fs.writeFileSync(f.source, webp(8000, 5000));
  f.nativeImage.createFromBuffer = () => { throw new Error('native unsupported'); };
  await assert.rejects(f.service.choose(), /3200 万像素/);
  fs.writeFileSync(f.source, webp(400, 300));
  const pending = await f.service.choose();
  await assert.rejects(f.service.finish({ token: pending.token, dataUrl: 'data:image/png;base64,not-png' }));
  assert.deepEqual(await f.service.get(), { dataUrl: null, custom: false });
  const next = await f.service.choose();
  const replacement = await f.service.choose();
  await assert.rejects(f.service.finish({ token: next.token, dataUrl: `data:image/png;base64,${png(20, 20).toString('base64')}` }), /失效/);
  await f.service.reset();
  await assert.rejects(f.service.finish({ token: replacement.token, dataUrl: `data:image/png;base64,${png(20, 20).toString('base64')}` }), /失效/);
  assert.deepEqual(await f.service.get(), { dataUrl: null, custom: false });
});

test('WebP fallback reads dimensions from VP8, VP8L and VP8X chunks', async t => {
  const f = fixture(t);
  f.nativeImage.createFromBuffer = () => ({ isEmpty: () => true });
  for (const format of ['VP8 ', 'VP8L', 'VP8X']) {
    const bytes = webp(640, 360, format);
    fs.writeFileSync(f.source, bytes);
    const result = await f.service.choose();
    assert.equal(result.needsDecode, true, `${format} should be accepted by header validation`);
    assert.equal(result.dataUrl, `data:image/webp;base64,${bytes.toString('base64')}`);
  }
});
