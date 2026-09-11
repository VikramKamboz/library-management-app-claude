import db from './db/database';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function calculateDueDate(issuedDate: string): string {
  const date = new Date(issuedDate);
  date.setDate(date.getDate() + 14);
  return date.toISOString().split('T')[0];
}

export function isDuplicateIsbn(isbn: string, excludeId?: number): boolean {
  if (excludeId !== undefined) {
    const row = db.prepare('SELECT id FROM books WHERE isbn = ? AND id != ?').get(isbn, excludeId);
    return row !== undefined;
  }
  const row = db.prepare('SELECT id FROM books WHERE isbn = ?').get(isbn);
  return row !== undefined;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// KAN-6: maximum number of times a single loan may be renewed.
export const MAX_RENEWALS = 2;

export interface RenewalEligibility {
  eligible: boolean;
  reason?: 'MAX_RENEWALS_REACHED' | 'LOAN_OVERDUE';
}

/**
 * Determines whether an active loan is eligible for renewal.
 * Rejects when the loan has already reached MAX_RENEWALS, or when the
 * loan is overdue (due_date in the past AND returned_date IS NULL —
 * the same overdue definition used by GET /api/loans/overdue).
 */
export function checkRenewalEligibility(loan: {
  due_date: string;
  renewal_count: number;
  returned_date: string | null;
}): RenewalEligibility {
  try {
    if (loan.renewal_count >= MAX_RENEWALS) {
      return { eligible: false, reason: 'MAX_RENEWALS_REACHED' };
    }
    const today = new Date().toISOString().split('T')[0];
    if (loan.returned_date === null && loan.due_date < today) {
      return { eligible: false, reason: 'LOAN_OVERDUE' };
    }
    return { eligible: true };
  } catch (err) {
    console.error('Failed to evaluate renewal eligibility:', err);
    // Fail safe: block the renewal if eligibility cannot be determined.
    return { eligible: false, reason: 'LOAN_OVERDUE' };
  }
}
