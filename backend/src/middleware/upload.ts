import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { HttpError } from '../lib/http-error.js';

/** Files accepted as a Docker image: what "docker save" writes, compressed or not. */
const ARCHIVE_EXTENSIONS = ['.tar', '.tar.gz', '.tgz'];

/**
 * Receives the .tar of a Docker image in the "archive" field of a multipart form.
 * The file is streamed straight to disk (it can weigh gigabytes), with a random
 * name chosen by us; the client's file name is only kept as information.
 */
export function receiveImageArchive(options: { uploadsDir: string; maxBytes: number }) {
  const upload = multer({
    storage: multer.diskStorage({
      // Multer creates the folder if it does not exist
      destination: options.uploadsDir,
      filename: (_req, _file, done) => done(null, `${randomUUID()}.tar`),
    }),
    limits: { fileSize: options.maxBytes, files: 1, fields: 10, fieldSize: 10_000 },
    fileFilter: (_req, file, done) => {
      const name = file.originalname.toLowerCase();
      if (ARCHIVE_EXTENSIONS.some((ext) => name.endsWith(ext))) done(null, true);
      else done(new HttpError(400, 'The image must be a .tar file made with "docker save"'));
    },
  }).single('archive');

  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const gb = (options.maxBytes / 1024 ** 3).toFixed(0);
        next(
          err.code === 'LIMIT_FILE_SIZE'
            ? new HttpError(413, `The image is too big (maximum ${gb} GB)`)
            : new HttpError(400, err.message),
        );
        return;
      }
      next(err);
    });
  };
}
