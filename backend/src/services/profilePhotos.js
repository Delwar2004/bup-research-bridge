const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');
const { invalid } = require('../utils/errors');

const MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_DIR = path.join(__dirname, '../../uploads/profile-photos');
const EXTENSIONS = ['.jpg', '.png', '.webp', '.gif'];

function imageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: '.jpg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: '.png' };
  }
  const head = buffer.subarray(0, 6).toString('ascii');
  if (head === 'GIF87a' || head === 'GIF89a') return { ext: '.gif' };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: '.webp' };
  }
  return null;
}

function storedPath(userId, ext) {
  return `/uploads/profile-photos/${userId}${ext}`;
}

function isOwnStoredPhoto(userId, value) {
  return typeof value === 'string' && EXTENSIONS.some((ext) => value === storedPath(userId, ext));
}

function assertPhotoReference(userId, value) {
  if (value == null || value === '') return;
  if (typeof value === 'string' && value.startsWith('/uploads/') && !isOwnStoredPhoto(userId, value)) {
    throw invalid('profilePhotoUrl', 'format', 'Use an http(s) image address, or upload a photo.');
  }
}

function readUploadedPhoto(req) {
  const type = req.get('content-type') || '';
  if (!type.includes('multipart/form-data')) {
    throw invalid('photo', 'format', 'Upload the image as multipart form data.');
  }
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: MAX_BYTES, fields: 0, parts: 1 },
      });
    } catch {
      reject(invalid('photo', 'format', 'Upload the image as multipart form data.'));
      return;
    }
    const chunks = [];
    let sawFile = false;
    let tooBig = false;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    busboy.on('file', (name, stream) => {
      if (name !== 'photo') {
        stream.resume();
        return;
      }
      sawFile = true;
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => {
        tooBig = true;
      });
    });
    busboy.on('error', () => fail(invalid('photo', 'format', 'The image upload could not be read.')));
    busboy.on('finish', () => {
      if (settled) return;
      settled = true;
      if (tooBig) {
        reject(invalid('photo', 'size', 'The image must be at most 2 MB.'));
        return;
      }
      if (!sawFile) {
        reject(invalid('photo', 'required', 'Choose an image file.'));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    req.pipe(busboy);
  });
}

function savePhoto(userId, buffer) {
  const kind = imageType(buffer);
  if (!kind) throw invalid('photo', 'format', 'Upload a JPEG, PNG, WEBP, or GIF image.');
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  removeStoredPhotos(userId);
  fs.writeFileSync(path.join(PHOTO_DIR, `${userId}${kind.ext}`), buffer);
  return storedPath(userId, kind.ext);
}

function removeStoredPhotos(userId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId || ''))) return;
  EXTENSIONS.forEach((ext) => {
    fs.rmSync(path.join(PHOTO_DIR, `${userId}${ext}`), { force: true });
  });
}

fs.mkdirSync(PHOTO_DIR, { recursive: true });

module.exports = {
  readUploadedPhoto,
  savePhoto,
  removeStoredPhotos,
  isOwnStoredPhoto,
  assertPhotoReference,
  PHOTO_DIR,
};
