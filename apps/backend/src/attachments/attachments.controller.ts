import { Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { AttachmentsService, MAX_ATTACHMENT_BYTES } from './attachments.service';

/** FR-2.2: medical-certificate upload/download for leave requests. */
@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post()
  @UseInterceptors(
    // Memory storage, not disk: the file has to be inspected (magic-byte
    // sniffing in AttachmentsService) before it is allowed anywhere near the
    // filesystem, and the 5MB cap keeps that bounded. `files: 1` stops a
    // client from sending a thousand small parts in one request to sidestep
    // the per-file size limit.
    FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    return this.attachments.upload(file, user.id);
  }

  @Get(':id')
  async download(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const { stream, filename, mimeType, sizeBytes } = await this.attachments.download(id, user);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', sizeBytes);
    // `inline` so HR can view a certificate without a download round-trip,
    // but with nosniff — the browser must honour the sniffed type recorded at
    // upload rather than re-guessing and potentially executing the content.
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Medical data: never let a shared proxy or the browser's disk cache keep a copy.
    res.setHeader('Cache-Control', 'private, no-store');

    stream.pipe(res);
  }
}
