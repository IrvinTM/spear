# Spear

**Spear** is a local-first productivity and automation dashboard built for students at the University of El Salvador (UES). It seamlessly syncs Moodle assignments and institutional emails to automatically generate a unified Todo list, extracts deadlines, and uses local AI to help draft homework and summarize course materials.

## Features

- **🎓 Moodle Sync Engine:** Connects to `campus.ues.edu.sv` to pull your enrolled courses, files, and assignments directly into a local SQLite database.
- **✉️ Institutional Email Sync:** Securely connects to your UES Gmail via IMAP, fetching recent emails and using local AI to summarize them and detect assignment deadlines.
- **📋 Unified Todo List:** Automatically creates actionable tasks from Moodle assignments and email deadlines, sorting them by urgency.
- **🔒 Secure Vault:** Your credentials (UES password, Gmail app password) never leave your machine. They are encrypted locally using AES-256-GCM and Argon2id.
- **🤖 Homework Agent (Coming Soon):** Uses the Antigravity CLI (`agy`) to read your course materials and assignment rubrics, generating context-aware outlines and drafts for your review.

## Architecture

Spear runs entirely locally on your machine.
- **Frontend:** Next.js (App Router), React, Tailwind CSS v4
- **Backend:** Next.js Server Actions, Node.js
- **Database:** SQLite (WAL mode) via `better-sqlite3`
- **AI Integration:** Spawns local shell commands to the Antigravity CLI (`agy`)

## Getting Started

1. **Prerequisites:**
   - Node.js 18+
   - Antigravity CLI (`agy`) installed and configured (for AI features)
   - A Gmail App Password for your UES email (requires 2FA enabled)

2. **Installation:**
   ```bash
   git clone <your-repo-url>
   cd spear
   npm install
   ```

3. **Run the Dashboard:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Onboarding:**
   The first time you run Spear, you will be guided through a secure setup wizard to create your master password and vault.
