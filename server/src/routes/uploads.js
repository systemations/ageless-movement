import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticateToken } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Uploads live under server/data/uploads so they share the Render
// persistent disk with the SQLite file (one disk per service on the
// Starter plan). The public URL path stays /uploads/* via express.static.
const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// Whitelist by mime type, then map to a canonical extension server-side
// so the stored filename is never derived from user input. A client
// sending "payload.exe.jpg" never gets that name on disk — they get a
// UUID + the extension we pick from the trusted mime type.
const ALLOWED_MIMES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  // Coach-uploaded course materials. Office files + zip can carry macros,
  // but uploaders are authenticated coaches (auth middleware upstream) and
  // files are served as static downloads, not executed. Revisit if we ever
  // expose client-side uploads of these types.
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/zip': '.zip',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIMES[file.mimetype] || '.bin';
    const name = `${crypto.randomUUID()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10,
    fields: 20,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES[file.mimetype]) return cb(null, true);
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

const router = Router();

// Wrap multer so fileFilter / size-limit rejections surface as clean 400s
// instead of being swallowed or leaking stack traces.
const runUpload = (handler) => (req, res, next) => {
  handler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
          ? 'File too large (max 10MB)'
          : err.code === 'LIMIT_FILE_COUNT'
            ? 'Too many files'
            : 'Upload failed';
        return res.status(400).json({ error: msg });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
};

router.post('/', authenticateToken, runUpload(upload.single('file')), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
});

router.post('/multiple', authenticateToken, runUpload(upload.array('files', 10)), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
  const urls = req.files.map(f => ({ url: `/uploads/${f.filename}`, filename: f.filename }));
  res.json({ files: urls });
});

export default router;
