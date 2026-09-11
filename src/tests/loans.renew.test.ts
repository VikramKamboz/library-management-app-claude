// KAN-6 / T5: automated tests for the loan renewal feature.
// Covers the story's own app-repo Definition of Done: successful
// renewal (due date extended, renewal_count incremented), renewal
// blocked at max renewals (2), and renewal blocked when overdue.
//
// Uses Node's built-in test runner (node:test) and built-in fetch —
// no new dependencies, consistent with the design's "no new
// dependencies" architecture decision. A dedicated temp SQLite file
// is used so these tests never touch real dev/prod data.

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Server } from 'node:http';
import type express from 'express';

let db: typeof import('../db/database').default;
let app: express.Express;
let server: Server;
let baseUrl: string;
let tmpDbPath: string;

/**
 * Inserts a loan row directly into the test database so each test can
 * set up the exact due_date/renewal_count/returned_date combination
 * it needs, without depending on the issue/return endpoints.
 */
function insertLoan(dueDate: string, renewalCount: number): number {
  const result = db
    .prepare(
      'INSERT INTO loans (book_id, member_id, issued_date, due_date, renewal_count) VALUES (1, 1, ?, ?, ?)'
    )
    .run('2026-01-01', dueDate, renewalCount);
  return Number(result.lastInsertRowid);
}

before(async () => {
  try {
    tmpDbPath = path.join(
      os.tmpdir(),
      `library-renew-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    process.env.LIBRARY_DB_PATH = tmpDbPath;

    const dbModule = await import('../db/database');
    const loansRouterModule = await import('../routes/loans');
    const expressModule = await import('express');

    db = dbModule.default;
    dbModule.initializeDatabase();

    // Seed one book and one member so loans can satisfy the FOREIGN
    // KEY constraints on books/members without touching real data.
    db.prepare(
      'INSERT INTO books (title, author, isbn, is_available) VALUES (?, ?, ?, 0)'
    ).run('Test Book', 'Test Author', 'TEST-ISBN-0001');
    db.prepare('INSERT INTO members (name, email) VALUES (?, ?)').run(
      'Test Member',
      'test.member@example.com'
    );

    app = expressModule.default();
    app.use(expressModule.default.json());
    app.use('/api/loans', loansRouterModule.default);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  } catch (err) {
    console.error('Failed to set up renewal test environment:', err);
    throw err;
  }
});

after(async () => {
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    console.error('Failed to close test server:', err);
  } finally {
    try {
      db.close();
    } catch (err) {
      console.error('Failed to close test database connection:', err);
    }
    try {
      fs.rmSync(tmpDbPath, { force: true });
    } catch (err) {
      console.error('Failed to remove temp test database:', err);
    }
  }
});

test('POST /api/loans/renew — successful renewal extends due date by 14 days and increments renewal_count', async () => {
  const futureDueDate = '2099-01-01'; // far future: never overdue
  const loanId = insertLoan(futureDueDate, 0);

  const res = await fetch(`${baseUrl}/api/loans/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loan_id: loanId }),
  });
  const body = (await res.json()) as { message: string; due_date: string; renewal_count: number };

  assert.equal(res.status, 200);
  assert.equal(body.message, 'Loan renewed successfully');
  assert.equal(body.renewal_count, 1);

  const expected = new Date();
  expected.setDate(expected.getDate() + 14);
  const expectedDueDate = expected.toISOString().split('T')[0];
  assert.equal(body.due_date, expectedDueDate);
});

test('POST /api/loans/renew — blocks renewal when max renewals (2) already reached', async () => {
  const futureDueDate = '2099-01-01';
  const loanId = insertLoan(futureDueDate, 2);

  const res = await fetch(`${baseUrl}/api/loans/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loan_id: loanId }),
  });
  const body = (await res.json()) as { error: string };

  assert.equal(res.status, 400);
  assert.equal(body.error, 'Maximum renewals (2) reached for this loan');
});

test('POST /api/loans/renew — blocks renewal when the loan is overdue', async () => {
  const pastDueDate = '2020-01-01';
  const loanId = insertLoan(pastDueDate, 0);

  const res = await fetch(`${baseUrl}/api/loans/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loan_id: loanId }),
  });
  const body = (await res.json()) as { error: string };

  assert.equal(res.status, 400);
  assert.equal(body.error, 'Cannot renew an overdue loan');
});
