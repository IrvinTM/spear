import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getDb } from '@/lib/db';
import { streamText } from '@/lib/llm';
import { checkLlmStatus } from '@/app/setup/actions';

export interface EmailSyncResult {
  success: boolean;
  emailsFetched: number;
  todosCreated: number;
  error?: string;
  durationMs: number;
}

/**
 * Summarize an email and extract deadline mentions using the LLM.
 */
async function processEmailWithLlm(subject: string, text: string): Promise<{ summary: string; deadline: string | null; hasDeadline: boolean }> {
  try {
    const status = await checkLlmStatus();
    if (!status.available) {
      return { summary: text.slice(0, 200), deadline: null, hasDeadline: false };
    }

    const prompt = `
Analyze the following email.
Provide a JSON object with this exact format:
{
  "summary": "A 1-2 sentence summary of the email",
  "has_deadline": true or false if the email explicitly mentions an assignment deadline, task, or exam date,
  "deadline_date": "ISO date string if has_deadline is true, otherwise null"
}

Email Subject: ${subject}
Email Body:
${text.slice(0, 3000)}
    `;

    // Fast extraction using flash-low model (hardcoded default in llm.ts for flash)
    const stream = streamText(prompt, {
      model: 'gemini-3.6-flash-low',
      timeout: 30000
    });

    let fullOutput = '';
    for await (const chunk of stream) {
      fullOutput += chunk;
    }

    // Try parsing
    const match = fullOutput.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        summary: parsed.summary || text.slice(0, 200),
        hasDeadline: !!parsed.has_deadline,
        deadline: parsed.deadline_date || null,
      };
    }
  } catch (err) {
    // LLM failed, fallback to basic text snippet
  }

  return { summary: text.slice(0, 200), deadline: null, hasDeadline: false };
}

export async function syncEmails(username: string, appPassword: string): Promise<EmailSyncResult> {
  const startTime = Date.now();
  const db = getDb();

  const insertLog = db.prepare(`
    INSERT INTO sync_log (sync_type, status, items_synced, started_at)
    VALUES ('email', 'pending', 0, datetime('now'))
  `);
  const logResult = insertLog.run();
  const logId = logResult.lastInsertRowid;

  let success = false;
  let errorMsg: string | undefined;
  let emailsFetched = 0;
  let todosCreated = 0;

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: username,
      pass: appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    try {
      // Fetch messages from the last 14 days
      const date14DaysAgo = new Date();
      date14DaysAgo.setDate(date14DaysAgo.getDate() - 14);

      // Search for emails since 14 days ago
      // UES uses @ues.edu.sv so we could filter by sender, but for now we'll fetch all or apply filter here.
      // E.g., client.search({ since: date14DaysAgo, from: 'ues.edu.sv' })
      const messages = client.fetch({ since: date14DaysAgo }, { source: true, envelope: true });

      const checkExisting = db.prepare('SELECT id FROM emails WHERE message_id = ?');
      const insertEmail = db.prepare(`
        INSERT INTO emails (
          message_id, from_address, from_name, subject, body_text, body_html,
          received_at, is_read, summary, has_deadline_mention, last_synced_at, created_at
        ) VALUES (
          @message_id, @from_address, @from_name, @subject, @body_text, @body_html,
          @received_at, @is_read, @summary, @has_deadline_mention, @last_synced_at, @created_at
        )
      `);
      const insertTodo = db.prepare(`
        INSERT INTO todos (title, description, source_type, source_id, due_date, status, priority, created_at, updated_at)
        VALUES (@title, @description, 'email', @source_id, @due_date, 'pending', 0, @created_at, @updated_at)
      `);

      for await (const message of messages) {
        const msgId = message.envelope?.messageId || message.uid.toString();
        
        // Skip if already exists
        if (checkExisting.get(msgId)) {
          continue;
        }

        if (!message.source) continue;
        const parsed = await simpleParser(message.source as Buffer);
        const fromAddr = parsed.from?.value[0]?.address || 'unknown';
        
        // Only process @ues.edu.sv for now to save tokens (could be configurable)
        if (!fromAddr.endsWith('@ues.edu.sv') && !fromAddr.endsWith('@gmail.com')) {
          // continue; 
        }

        const subject = parsed.subject || 'No Subject';
        const bodyText = parsed.text || '';
        const receivedAt = parsed.date ? parsed.date.toISOString() : new Date().toISOString();
        const now = new Date().toISOString();

        // Run LLM logic
        const analysis = await processEmailWithLlm(subject, bodyText);

        db.prepare('BEGIN').run();
        try {
          const res = insertEmail.run({
            message_id: msgId,
            from_address: fromAddr,
            from_name: parsed.from?.value[0]?.name || fromAddr,
            subject: subject,
            body_text: bodyText,
            body_html: parsed.html || null,
            received_at: receivedAt,
            is_read: message.flags?.has('\\Seen') ? 1 : 0,
            summary: analysis.summary,
            has_deadline_mention: analysis.hasDeadline ? 1 : 0,
            last_synced_at: now,
            created_at: now,
          });

          if (analysis.hasDeadline) {
            insertTodo.run({
              title: 'Email: ' + subject.slice(0, 100),
              description: analysis.summary,
              source_id: Number(res.lastInsertRowid),
              due_date: analysis.deadline || null,
              created_at: now,
              updated_at: now,
            });
            todosCreated++;
          }

          db.prepare('COMMIT').run();
          emailsFetched++;
        } catch (innerErr) {
          db.prepare('ROLLBACK').run();
        }
      }
      
      success = true;
    } finally {
      lock.release();
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Unknown email sync error';
    success = false;
  } finally {
    try {
      await client.logout();
    } catch {}
  }

  // Update sync log
  db.prepare(`
    UPDATE sync_log
    SET status = ?, items_synced = ?, error_message = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(
    success ? 'success' : 'failed',
    emailsFetched,
    errorMsg || null,
    logId,
  );

  return {
    success,
    emailsFetched,
    todosCreated,
    error: errorMsg,
    durationMs: Date.now() - startTime,
  };
}
