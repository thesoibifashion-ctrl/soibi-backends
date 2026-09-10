import {
  createAcademyRegistration,
  findAllAcademyRegistrations,
  findAcademyRegistrationById,
  patchAcademyRegistrationIsRead,
} from '../repositories/academy.repository.js';
import { AppError } from '../utils/AppError.js';
import { sendEmail } from '../utils/mailer.js';
import { getNotificationSettings } from '../utils/notificationSettings.js';
import { buildCustomerAcademyEmail } from '../utils/customerEmails.js';
import { buildAdminAcademyEmail } from '../utils/adminNotificationEmails.js';
import type {
  AcademyRegistration,
  AcademyRegistrationInput,
  AdminAcademyRegistration,
} from '../types/form.types.js';

export async function registerForAcademy(
  input: AcademyRegistrationInput,
): Promise<AcademyRegistration> {
  const registration = await createAcademyRegistration(input);
  void sendAcademyEmails(registration).catch((error: unknown) =>
    console.error('[academy] Failed to send notification emails:', error),
  );
  return registration;
}

async function sendAcademyEmails(registration: AcademyRegistration): Promise<void> {
  const settings = await getNotificationSettings();
  const emails: Promise<void>[] = [];
  if (settings.notifyAdminOnAcademy) emails.push(sendEmail({
      to: settings.notificationEmail,
      subject: 'New Academy Application — Soibi',
      html: buildAdminAcademyEmail(registration),
    }));
  if (settings.notifyCustomerOnAcademy) emails.push(sendEmail({
      to: registration.email,
      subject: 'Application Received — Soibi Academy',
      html: buildCustomerAcademyEmail(registration.fullName),
    }));
  const results = await Promise.allSettled(emails);
  results.filter((result) => result.status === 'rejected').forEach((result) => console.error('[academy] Email failed:', result.reason));
}

export async function getAllAcademyRegistrations(): Promise<AdminAcademyRegistration[]> {
  return findAllAcademyRegistrations();
}

export async function getAcademyRegistrationById(id: string): Promise<AdminAcademyRegistration> {
  const registration = await findAcademyRegistrationById(id);
  if (!registration) throw AppError.notFound('Academy application not found');
  return registration;
}

export async function setAcademyRegistrationIsRead(id: string, isRead: boolean): Promise<void> {
  if (!await patchAcademyRegistrationIsRead(id, isRead)) {
    throw AppError.notFound('Academy application not found');
  }
}
