import {
  createContactSubmission,
  findAllContactSubmissions,
  findContactSubmissionById,
  patchContactSubmissionIsRead,
} from '../repositories/contact.repository.js';
import { AppError } from '../utils/AppError.js';
import { sendEmail } from '../utils/mailer.js';
import { getNotificationSettings } from '../utils/notificationSettings.js';
import { buildCustomerContactEmail } from '../utils/customerEmails.js';
import { buildAdminContactEmail } from '../utils/adminNotificationEmails.js';
import type {
  AdminContactSubmission,
  ContactSubmission,
  ContactSubmissionInput,
} from '../types/form.types.js';

export async function submitContactForm(input: ContactSubmissionInput): Promise<ContactSubmission> {
  const submission = await createContactSubmission(input);
  void sendContactEmails(submission).catch((error: unknown) =>
    console.error('[contact] Failed to send notification emails:', error),
  );
  return submission;
}

async function sendContactEmails(submission: ContactSubmission): Promise<void> {
  const settings = await getNotificationSettings();
  const emails: Promise<void>[] = [];
  if (settings.notifyAdminOnContact) emails.push(sendEmail({
      to: settings.notificationEmail,
      subject: 'New Contact Submission — Soibi',
      html: buildAdminContactEmail(submission),
    }));
  if (settings.notifyCustomerOnContact) emails.push(sendEmail({
      to: submission.email,
      subject: 'Message Received — Soibi',
      html: buildCustomerContactEmail(submission.name, submission.subject),
    }));
  const results = await Promise.allSettled(emails);
  results.filter((result) => result.status === 'rejected').forEach((result) => console.error('[contact] Email failed:', result.reason));
}

export async function getAllContactSubmissions(): Promise<AdminContactSubmission[]> {
  return findAllContactSubmissions();
}

export async function getContactSubmissionById(id: string): Promise<AdminContactSubmission> {
  const submission = await findContactSubmissionById(id);
  if (!submission) throw AppError.notFound('Contact submission not found');
  return submission;
}

export async function setContactSubmissionIsRead(id: string, isRead: boolean): Promise<void> {
  if (!await patchContactSubmissionIsRead(id, isRead)) {
    throw AppError.notFound('Contact submission not found');
  }
}
