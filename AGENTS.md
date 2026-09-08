<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Package Manager
ALWAYS use `pnpm` for all package installations and script executions. Do not use `npm` or `yarn`.

---

# Architecture & VM Setup

The application is deployed on a dedicated Google Cloud Platform (GCP) Compute Engine virtual machine:

- **VM Name**: `spear-server` (Zone: `us-central1-a`)
- **Machine Type**: e2-micro (1 GB RAM, 3 GB Swap)
- **Private Networking**: Tailscale (authenticated access restricted to authorized Google accounts; no open public ports)
- **App Directory**: `/home/codespace/spear`
- **Data & Persistent State**: `/home/codespace/.ues-agent/`
  - `campus-copilot.db`: SQLite database (courses, assignments, emails, attention items, activity logs)
  - `settings.json`: User configuration
  - `data/characters/`: VRM and GLB 3D avatars
  - `data/animations/`: VRMA animation files
  - `data/materials/`: Downloaded syllabi, slides, and class files
- **AI CLI (`agy`)**: Installed at `/usr/local/bin/agy`, authenticated via `~/.gemini/antigravity-cli/`
- **Text-to-Speech (Piper TTS)**: Installed at `/home/codespace/piper/piper` using Spanish voice model (`es_AR-daniela-high.onnx`)
- **Systemd Service**: `spear.service` manages the production process running `pnpm start -p 3000`

---

# Safe Deployment Protocol (Zero-Crash Workflow)

> [!CAUTION]
> **NEVER RUN `next build` OR `pnpm build` DIRECTLY ON THE GCP VM.**
> The VM has 1 GB of physical RAM. Running Next.js compilation / Turbopack directly on the VM will trigger the Linux Out-Of-Memory (OOM) killer or freeze the server, causing service downtime.

Always build the application in the development environment (e.g., Codespace container or workstation) and transfer the compiled `.next` bundle to the VM.

### Standard 6-Step Deployment Procedure

#### 1. Free Container Memory & Compile Locally
Before compiling, verify available memory in your development container:
```bash
free -m
```
If memory is low (< 2 GB available), terminate any stale dev servers or zombie node processes:
```bash
pkill -f "next-server" || true
```
Then create the optimized production build:
```bash
pnpm build
```

#### 2. Commit & Push Code Changes
Push code changes to GitHub:
```bash
git add -A
git commit -m "feat/fix: <description of changes>"
git push origin master
```

#### 3. Package the Production Build
Create a compressed archive of the compiled `.next` output, omitting temporary dev caches:
```bash
tar -czf /tmp/next-build.tar.gz --exclude='.next/cache' --exclude='.next/dev' .next
```

#### 4. Upload Build Archive to the VM
Transfer the archive using `gcloud compute scp`:
```bash
gcloud compute scp /tmp/next-build.tar.gz spear-server:/tmp/next-build.tar.gz --zone=us-central1-a --quiet
```

#### 5. Update Code, Unpack Build & Restart Service
Run the following atomic command over SSH:
```bash
gcloud compute ssh spear-server --zone=us-central1-a --quiet --command="cd /home/codespace/spear && git pull origin master && rm -rf .next && tar -xzf /tmp/next-build.tar.gz && rm -f /tmp/next-build.tar.gz && sudo systemctl restart spear"
```

#### 6. Verify Service Health
Ensure `spear.service` is active and endpoints respond with `HTTP 200 OK`:
```bash
gcloud compute ssh spear-server --zone=us-central1-a --quiet --command="sudo systemctl status spear --no-pager && curl -sI http://localhost:3000/"
```

---

# Development & Mobile Guidelines

1. **Prevent Horizontal Layout Blowout (Avoid "Desktop Mode" on Mobile)**:
   - All page layouts, lists, and tables MUST include `min-w-0 max-w-full overflow-x-hidden`.
   - Long URLs, subjects, and email addresses must use `break-words` or `break-all`.
   - In flex containers, default `min-width: auto` will stretch the viewport if children are wide. Always add `min-w-0` to flex items with text or dynamic content.
2. **Prevent iOS Safari Auto-Zoom**:
   - All input fields, select elements, and textareas must use `text-base md:text-sm` (font sizes under 16px cause iOS Safari to auto-zoom the viewport).
3. **Hydration Safety**:
   - Do NOT read `localStorage` or `window` inside `useState(() => ...)` during initial component render. This causes SSR/CSR HTML divergence and hydration crashes.
   - Always initialize state to a safe default and sync from `localStorage` inside `useEffect()`.
4. **3D Character & Pointer Events**:
   - The Three.js canvas in `CharacterViewer` should use `pointer-events-none` so it does not block touch scrolling or clicks on underlying cards. Clickable UI elements (buttons, inputs, toggles) must explicitly set `pointer-events-auto relative z-20`.
5. **No Secrets in Public Files**:
   - `AGENTS.md` and repository files are public. Never commit tokens, session cookies, passwords, private keys, or API secrets. Keep credentials confined to the secure server vault (`~/.ues-agent/`).

