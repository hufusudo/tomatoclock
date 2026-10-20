const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const marker = 'tomatoclock-rest-image-v1';
const sourceLimit = 16 * 1024 * 1024;
const storedLimit = 20 * 1024 * 1024;
const stateLimit = Math.ceil(storedLimit / 3) * 4 + 4096;
const maxPixels = 32 * 1024 * 1024;
const maxEdge = 2048;
const extensions = new Set(['png', 'jpg', 'jpeg', 'webp']);

function isMissing(error) { return error?.code === 'ENOENT'; }
function defaultValue() { return { dataUrl: null, custom: false }; }
function cleanName(value) {
  let name = path.basename(String(value || '休息背景'))
    .replace(/[\u0000-\u001f\u007f/\\]/g, '')
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 100);
  if (!name || name === '.' || name === '..') name = '休息背景';
  return `${name}.png`;
}

async function readRegularFile(filePath, limit) {
  const info = await fs.lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('休息图片状态必须是普通文件。');
  const handle = await fs.open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('休息图片状态文件过大或无效。');
    const chunks = [];
    const chunk = Buffer.alloc(64 * 1024);
    let used = 0;
    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, limit + 1 - used), used);
      if (!bytesRead) break;
      used += bytesRead;
      if (used > limit) throw new Error('休息图片状态文件过大。');
      chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
    }
    return Buffer.concat(chunks, used);
  } finally { await handle.close(); }
}

function pngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function inputFormat(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function webpDimensions(buffer) {
  if (inputFormat(buffer) !== 'webp' || buffer.length < 12) return null;
  const declaredLength = buffer.readUInt32LE(4);
  if (declaredLength < 4 || declaredLength + 8 > buffer.length) return null;
  const end = declaredLength + 8;
  for (let offset = 12; offset + 8 <= end;) {
    const kind = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + length > end) return null;
    if (kind === 'VP8X' && length >= 10) {
      return { width: 1 + buffer[data + 4] + (buffer[data + 5] << 8) + (buffer[data + 6] << 16), height: 1 + buffer[data + 7] + (buffer[data + 8] << 8) + (buffer[data + 9] << 16) };
    }
    if (kind === 'VP8L' && length >= 5 && buffer[data] === 0x2f) {
      const b1 = buffer[data + 1], b2 = buffer[data + 2], b3 = buffer[data + 3], b4 = buffer[data + 4];
      return { width: 1 + b1 + ((b2 & 0x3f) << 8), height: 1 + ((b2 >> 6) & 0x03) + (b3 << 2) + ((b4 & 0x0f) << 10) };
    }
    if (kind === 'VP8 ' && length >= 10 && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return { width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff };
    }
    offset = data + length + (length & 1);
  }
  return null;
}

function createRestImageService({ configDir, dialog, window, nativeImage }) {
  if (!path.isAbsolute(configDir)) throw new Error('配置目录必须是绝对路径。');
  if (!dialog || typeof dialog.showOpenDialog !== 'function') throw new Error('休息图片选择器不可用。');
  if (!nativeImage || typeof nativeImage.createFromBuffer !== 'function') throw new Error('休息图片解码器不可用。');
  const filePath = path.join(configDir, 'rest-image.json');
  let queue = Promise.resolve();
  let pendingWebp = null;
  function serialized(action) {
    const run = queue.then(action, action);
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async function readState() {
    let bytes;
    try { bytes = await readRegularFile(filePath, stateLimit); }
    catch (error) { if (isMissing(error)) return null; throw error; }
    let state;
    try { state = JSON.parse(bytes.toString('utf8')); }
    catch { throw new Error('休息图片状态文件格式无效。'); }
    if (!state || state.format !== marker) throw new Error('休息图片状态文件不属于番茄钟，未覆盖未知文件。');
    if (typeof state.custom !== 'boolean') throw new Error('休息图片状态文件格式无效。');
    if (!state.custom) return defaultValue();
    if (typeof state.name !== 'string' || typeof state.dataUrl !== 'string' || !state.dataUrl.startsWith('data:image/png;base64,')) throw new Error('休息图片状态数据无效。');
    const encoded = state.dataUrl.slice('data:image/png;base64,'.length);
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    if (encoded.length > Math.ceil(storedLimit / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || (padding && encoded.indexOf('=') !== encoded.length - padding)) throw new Error('休息图片状态数据无效或过大。');
    const png = Buffer.from(encoded, 'base64');
    const dimensions = pngDimensions(png);
    if (!png.length || png.length > storedLimit || !dimensions || dimensions.width > maxEdge || dimensions.height > maxEdge || dimensions.width * dimensions.height > maxPixels) throw new Error('休息图片状态数据无效或过大。');
    return { dataUrl: state.dataUrl, custom: true, name: cleanName(state.name) };
  }

  async function ensureOwnedOrAbsent() {
    const existing = await readState();
    if (existing === null) return null;
    return existing;
  }

  async function writeState(value) {
    await fs.mkdir(configDir, { recursive: true });
    const previous = await ensureOwnedOrAbsent();
    const payload = Buffer.from(JSON.stringify(value.custom
      ? { format: marker, custom: true, name: value.name, dataUrl: value.dataUrl }
      : { format: marker, custom: false }));
    const tempPath = path.join(configDir, `.rest-image-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await fs.open(tempPath, 'wx', 0o600);
      await handle.writeFile(payload);
      await handle.sync();
      await handle.close(); handle = null;
      const current = await ensureOwnedOrAbsent();
      if (previous === null) {
        if (current !== null) throw new Error('休息图片状态文件已存在，未覆盖未知文件。');
        await fs.link(tempPath, filePath);
      } else if (current === null || current.dataUrl !== previous.dataUrl || current.custom !== previous.custom || current.name !== previous.name) {
        throw new Error('休息图片状态在写入期间发生变化，未覆盖。');
      } else {
        await fs.rename(tempPath, filePath);
      }
    } finally {
      if (handle) await handle.close().catch(() => {});
      await fs.unlink(tempPath).catch(error => { if (!isMissing(error)) throw error; });
    }
  }

  async function decode(buffer) {
    let image;
    try { image = nativeImage.createFromBuffer(buffer); }
    catch { throw new Error('无法读取所选图片。'); }
    if (!image || image.isEmpty?.()) throw new Error('所选文件不是有效的 PNG、JPEG 或 WebP 图片。');
    const size = image.getSize?.();
    if (!size || !Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height) || size.width < 1 || size.height < 1 || size.width * size.height > maxPixels) throw new Error('图片尺寸无效或超过 3200 万像素。');
    let output = image;
    if (size.width > maxEdge || size.height > maxEdge) {
      const ratio = Math.min(maxEdge / size.width, maxEdge / size.height);
      output = image.resize({ width: Math.max(1, Math.round(size.width * ratio)), height: Math.max(1, Math.round(size.height * ratio)), quality: 'good' });
    }
    const png = output.toPNG();
    if (!Buffer.isBuffer(png) || png.length === 0 || png.length > storedLimit) throw new Error('转换后的图片过大。');
    return png;
  }

  async function decodePngDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('解码后的图片数据无效。');
    const encoded = dataUrl.slice('data:image/png;base64,'.length);
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    if (!encoded || encoded.length > Math.ceil(storedLimit / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || (padding && encoded.indexOf('=') !== encoded.length - padding)) throw new Error('解码后的图片数据无效或过大。');
    const bytes = Buffer.from(encoded, 'base64');
    const dimensions = pngDimensions(bytes);
    if (!bytes.length || bytes.length > storedLimit || !dimensions || dimensions.width > maxEdge || dimensions.height > maxEdge || dimensions.width * dimensions.height > maxPixels) throw new Error('解码后的 PNG 图片尺寸无效或超限。');
    const png = await decode(bytes);
    const cleanSize = pngDimensions(png);
    if (!cleanSize || cleanSize.width > maxEdge || cleanSize.height > maxEdge || cleanSize.width * cleanSize.height > maxPixels) throw new Error('解码后的 PNG 图片头无效或尺寸超限。');
    return png;
  }

  return {
    get: () => serialized(async () => (await readState()) ?? defaultValue()),
    choose: () => {
      return serialized(async () => {
      pendingWebp = null;
      const selected = await dialog.showOpenDialog(window, {
        title: '选择休息背景图片', properties: ['openFile'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      });
      if (selected?.canceled || !selected?.filePaths?.[0]) return { canceled: true };
      const pickedPath = selected.filePaths[0];
      if (typeof pickedPath !== 'string' || !path.isAbsolute(pickedPath)) throw new Error('所选图片路径无效。');
      if (!extensions.has(path.extname(pickedPath).slice(1).toLowerCase())) throw new Error('仅支持 PNG、JPEG 和 WebP 图片。');
      const input = await readRegularFile(pickedPath, sourceLimit);
      if (!input.length) throw new Error('所选图片为空。');
      const format = inputFormat(input);
      if (!format) throw new Error('所选文件内容不是 PNG、JPEG 或 WebP 图片。');
      if (format === 'png') {
        const dimensions = pngDimensions(input);
        if (!dimensions || dimensions.width * dimensions.height > maxPixels) throw new Error('PNG 图片头无效或超过 3200 万像素。');
      }
      const dimensions = format === 'webp' ? webpDimensions(input) : null;
      if (format === 'webp' && (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width * dimensions.height > maxPixels)) throw new Error('WebP 图片头无效或超过 3200 万像素。');
      if (format === 'webp') {
        let supported = false;
        try {
          const candidate = nativeImage.createFromBuffer(input);
          supported = !!candidate && !candidate.isEmpty?.();
        } catch { /* Renderer fallback handles valid WebP when Electron cannot decode it. */ }
        if (!supported) {
          const token = randomUUID();
          const name = cleanName(pickedPath);
          pendingWebp = { token, name, expiresAt: Date.now() + 3 * 60 * 1000 };
          return { needsDecode: true, dataUrl: `data:image/webp;base64,${input.toString('base64')}`, name, token };
        }
      }
      const png = await decode(input);
      const outputSize = pngDimensions(png);
      if (!outputSize || outputSize.width > maxEdge || outputSize.height > maxEdge || outputSize.width * outputSize.height > maxPixels) throw new Error('转换后的 PNG 图片头无效或尺寸超限。');
      const result = { dataUrl: `data:image/png;base64,${png.toString('base64')}`, custom: true, name: cleanName(pickedPath) };
      await writeState(result);
      return result;
      });
    },
    finish: ({ token, dataUrl } = {}) => serialized(async () => {
      const pending = pendingWebp;
      if (pending && Date.now() > pending.expiresAt) pendingWebp = null;
      if (!pending || typeof token !== 'string' || token !== pending.token || Date.now() > pending.expiresAt) throw new Error('WebP 解码请求已失效，请重新选择图片。');
      pendingWebp = null;
      const png = await decodePngDataUrl(dataUrl);
      const result = { dataUrl: `data:image/png;base64,${png.toString('base64')}`, custom: true, name: pending.name };
      await writeState(result);
      return result;
    }),
    reset: () => {
      return serialized(async () => {
      pendingWebp = null;
      const value = defaultValue();
      await writeState(value);
      return value;
      });
    }
  };
}

module.exports = { createRestImageService };
