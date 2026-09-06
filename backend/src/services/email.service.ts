import nodemailer, { type Transporter } from 'nodemailer';
import { EmailStatus } from '@prisma/client';
import { env, smtpCredentials } from '../config/env.js';
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
let simulateSend = false;

/**
 * Ensure Ethereal credentials exist (create a throwaway account when unset).
 * If SMTP is unreachable (common on free hosts that block port 587), fall back
 * to simulated delivery so scheduling demos still work.
 */
export async function ensureSmtpCredentials(): Promise<void> {
  if (!smtpCredentials.user || !smtpCredentials.pass) {
    try {
      const account = await nodemailer.createTestAccount();
      smtpCredentials.user = account.user;
      smtpCredentials.pass = account.pass;
      logger.info('Created Ethereal test SMTP account', {
        user: account.user,
        host: account.smtp.host,
        port: account.smtp.port,
      });
    } catch (error) {
      simulateSend = true;
      logger.warn('Could not create Ethereal account; using simulated sends', {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

  try {
    await getMailTransporter().verify();
    logger.info('SMTP connection verified');
  } catch (error) {
    simulateSend = true;
    transporter = null;
    logger.warn('SMTP verify failed; using simulated sends', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function getMailTransporter(): Transporter {
  if (simulateSend) {
    throw new Error('SMTP is in simulated mode');
  }

  if (!smtpCredentials.user || !smtpCredentials.pass) {
    throw new Error('SMTP credentials are not configured');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.ETHEREAL_HOST,
      port: env.ETHEREAL_PORT,
      secure: false,
      auth: {
        user: smtpCredentials.user,
        pass: smtpCredentials.pass,
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
  let sanitized = message;
  if (smtpCredentials.pass) {
    sanitized = sanitized.split(smtpCredentials.pass).join('[redacted]');
  }
  if (smtpCredentials.user) {
    sanitized = sanitized.split(smtpCredentials.user).join('[redacted]');
  }
  return sanitized;
}

/**
 * Send a single email that has already been claimed as PROCESSING.
 * Does not mutate status — the poller owns SCHEDULED/PROCESSING/SENT/FAILED.
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

  if (simulateSend) {
    const messageId = `simulated-${email.id}@reachinbox.local`;
    logger.info('Simulated email send', {
      emailId: email.id,
      from,
      recipient: email.recipient,
      messageId,
    });
    return {
      emailId: email.id,
      recipient: email.recipient,
      messageId,
      previewUrl: false,
      accepted: [email.recipient],
      rejected: [],
    };
  }

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
