import nodemailer, { type Transporter } from 'nodemailer';
import { EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface SendEmailResult {
  emailId: string;
  recipient: string;
  messageId: string;
  previewUrl: string | false;
  accepted: string[];
  rejected: string[];
}

let transporter: Transporter | null = null;

/**
 * Shared Nodemailer transport for the worker process.
 *
 * Development/Ethereal assumption:
 * All Sender rows authenticate with the single ETHEREAL_USER / ETHEREAL_PASSWORD
 * account from env. Sender.email + Sender.displayName are used only as the
 * From identity. SMTP passwords are never stored on Sender.
 */
export function getMailTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.ETHEREAL_HOST,
      port: env.ETHEREAL_PORT,
      secure: false,
      auth: {
        user: env.ETHEREAL_USER,
        pass: env.ETHEREAL_PASSWORD,
      },
    });
  }

  return transporter;
}

function formatFromAddress(displayName: string | null, email: string): string {
  const name = displayName?.trim();
  if (!name) {
    return email;
  }
  return `"${name.replace(/"/g, '')}" <${email}>`;
}

function sanitizeSmtpError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(env.ETHEREAL_PASSWORD, '[redacted]')
    .replace(env.ETHEREAL_USER, '[redacted]');
}

/**
 * Send a single email that has already been claimed as PROCESSING.
 * Does not mutate status — the worker owns SCHEDULED/PROCESSING/SENT/FAILED transitions.
 */
export async function sendEmail(emailId: string): Promise<SendEmailResult> {
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true },
  });

  if (!email) {
    throw new AppError(`Email not found: ${emailId}`, 404);
  }

  if (!email.sender) {
    throw new AppError(`Sender not found for email: ${emailId}`, 404);
  }

  if (email.status !== EmailStatus.PROCESSING) {
    throw new AppError(
      `Email ${emailId} is not eligible to send (status=${email.status})`,
      400,
    );
  }

  const from = formatFromAddress(email.sender.displayName, email.sender.email);

  try {
    const info = await getMailTransporter().sendMail({
      from,
      to: email.recipient,
      subject: email.subject,
      text: email.body,
      html: email.body.includes('<') ? email.body : undefined,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    return {
      emailId: email.id,
      recipient: email.recipient,
      messageId: info.messageId,
      previewUrl,
      accepted: info.accepted.map(String),
      rejected: info.rejected.map(String),
    };
  } catch (error) {
    const sanitized = sanitizeSmtpError(error);
    logger.error('SMTP send failed', { emailId, error: sanitized });
    throw new Error(sanitized);
  }
}

export { sanitizeSmtpError };
