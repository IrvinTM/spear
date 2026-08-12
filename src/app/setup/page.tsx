'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setupVault, checkLlmStatus, type ActionResult } from './actions';

type Step = 'welcome' | 'master-password' | 'credentials' | 'llm-check' | 'complete';

const STEPS: Step[] = ['welcome', 'master-password', 'credentials', 'llm-check', 'complete'];

function getStepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

function getPasswordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

/* ------------------------------------------------------------------ */
/*  Stepper                                                           */
/* ------------------------------------------------------------------ */
function Stepper({ currentIndex }: { currentIndex: number }) {
  const innerSteps = STEPS.slice(1, -1); // exclude welcome & complete
  return (
    <div className="flex items-center gap-2 pb-6">
      {innerSteps.map((s, i) => {
        const sIdx = i + 1;
        const done = currentIndex > sIdx;
        const active = currentIndex === sIdx;
        return (
          <div key={s} className="contents">
            <div
              className={`step-dot ${
                done ? 'step-dot--done' : active ? 'step-dot--active' : 'step-dot--pending'
              }`}
            >
              {done ? '✓' : i + 1}
            </div>
            {i < innerSteps.length - 1 && (
              <div className={`stepper-connector ${done ? 'stepper-connector--done' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared Card Wrapper                                               */
/* ------------------------------------------------------------------ */
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`bg-stone-900 border border-white/[0.06] rounded-2xl p-8 shadow-lg animate-slide-up ${className}`}
  >
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */
export default function SetupPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>('welcome');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [uesUsername, setUesUsername] = useState('');
  const [uesPassword, setUesPassword] = useState('');
  const [gmailAppPassword, setGmailAppPassword] = useState('');
  const [error, setError] = useState('');
  const [agyAvailable, setAgyAvailable] = useState<boolean | null>(null);

  const stepIndex = getStepIndex(step);
  const pwStrength = getPasswordStrength(masterPassword);

  const goNext = useCallback(() => {
    setError('');
    const next = stepIndex + 1;
    if (next < STEPS.length) setStep(STEPS[next]);
  }, [stepIndex]);

  const goBack = useCallback(() => {
    setError('');
    const prev = stepIndex - 1;
    if (prev >= 0) setStep(STEPS[prev]);
  }, [stepIndex]);

  const handlePasswordSubmit = useCallback(() => {
    if (masterPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (masterPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    goNext();
  }, [masterPassword, confirmPassword, goNext]);

  const handleCredentialsSubmit = useCallback(() => {
    if (!uesUsername.trim() || !uesPassword.trim()) {
      setError('UES username and password are required.');
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.append('masterPassword', masterPassword);
      formData.append('uesUsername', uesUsername.trim());
      formData.append('uesPassword', uesPassword);
      if (gmailAppPassword.trim()) {
        formData.append('gmailAppPassword', gmailAppPassword.trim());
      }
      const result: ActionResult = await setupVault(formData);
      if (!result.success) {
        setError(result.error || 'Failed to create vault.');
        return;
      }
      const llmStatus = await checkLlmStatus();
      setAgyAvailable(llmStatus.available);
      goNext();
    });
  }, [uesUsername, uesPassword, gmailAppPassword, masterPassword, goNext]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[520px]">
        {/* Header */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-accent-700 to-accent-500 mb-5 text-2xl shadow-glow">
            🎓
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Spear</h1>
          <p className="text-sm text-stone-400 leading-relaxed">
            Your personal UES automation dashboard.
            {step === 'welcome' ? " Let's get you set up." : ''}
          </p>
        </div>

        {/* Stepper (hidden on welcome & complete) */}
        {step !== 'welcome' && step !== 'complete' && <Stepper currentIndex={stepIndex} />}

        {/* ── Welcome ── */}
        {step === 'welcome' && (
          <Card>
            <h2 className="text-xl font-semibold mb-2">Welcome</h2>
            <p className="text-sm text-stone-400 leading-relaxed mb-6">
              Spear syncs your Moodle courses, assignments, and email into a single
              dashboard. It runs locally on your machine — your credentials never leave this device.
            </p>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-info/[0.08] border border-info/20 text-sm text-blue-300 mb-4">
              <span>ℹ️</span>
              <span>
                You&apos;ll need your UES Moodle username and password. Optionally, a Gmail app
                password for email sync.
              </span>
            </div>
            <button
              className="w-full mt-2 px-6 py-3.5 rounded-xl bg-accent-600 text-white font-medium text-base border border-accent-700 shadow-sm hover:bg-accent-500 hover:shadow-glow hover:-translate-y-px active:bg-accent-700 active:translate-y-0 transition-all cursor-pointer"
              onClick={goNext}
            >
              Get started
            </button>
          </Card>
        )}

        {/* ── Master Password ── */}
        {step === 'master-password' && (
          <Card key="master-password">
            <h2 className="text-xl font-semibold mb-2">Create master password</h2>
            <p className="text-sm text-stone-400 leading-relaxed mb-6">
              This encrypts your credentials locally using AES-256-GCM. You&apos;ll need this
              password each time you start Spear.
            </p>

            <div className="flex flex-col gap-5">
              {/* password */}
              <div className="flex flex-col gap-2">
                <label htmlFor="master-pw" className="text-sm font-medium text-stone-400 tracking-wide">
                  Master password
                </label>
                <input
                  id="master-pw"
                  type="password"
                  placeholder="At least 8 characters"
                  value={masterPassword}
                  onChange={(e) => { setMasterPassword(e.target.value); setError(''); }}
                  autoFocus
                  className={`w-full px-4 py-3 rounded-lg bg-stone-950 border text-stone-50 text-base outline-none placeholder:text-stone-500 transition-all focus:border-accent-500 focus:ring-[3px] focus:ring-accent-500/15 ${
                    error && !confirmPassword ? 'border-danger' : 'border-white/10'
                  }`}
                />
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`pw-bar ${
                        pwStrength >= level
                          ? level <= 1
                            ? 'pw-bar--weak'
                            : level <= 2
                            ? 'pw-bar--fair'
                            : 'pw-bar--good'
                          : ''
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* confirm */}
              <div className="flex flex-col gap-2">
                <label htmlFor="confirm-pw" className="text-sm font-medium text-stone-400 tracking-wide">
                  Confirm password
                </label>
                <input
                  id="confirm-pw"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                  className={`w-full px-4 py-3 rounded-lg bg-stone-950 border text-stone-50 text-base outline-none placeholder:text-stone-500 transition-all focus:border-accent-500 focus:ring-[3px] focus:ring-accent-500/15 ${
                    error ? 'border-danger' : 'border-white/10'
                  }`}
                />
              </div>

              {error && <p className="text-xs text-danger flex items-center gap-1">⚠ {error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                className="flex-1 px-5 py-3 rounded-lg bg-stone-700 text-stone-50 font-medium text-sm border border-white/10 hover:bg-stone-600 hover:border-white/15 transition-all cursor-pointer"
                onClick={goBack}
              >
                Back
              </button>
              <button
                className="flex-1 px-5 py-3 rounded-lg bg-accent-600 text-white font-medium text-sm border border-accent-700 shadow-sm hover:bg-accent-500 hover:shadow-glow hover:-translate-y-px active:bg-accent-700 active:translate-y-0 transition-all cursor-pointer"
                onClick={handlePasswordSubmit}
              >
                Continue
              </button>
            </div>
          </Card>
        )}

        {/* ── Credentials ── */}
        {step === 'credentials' && (
          <Card key="credentials">
            <h2 className="text-xl font-semibold mb-2">Your credentials</h2>
            <p className="text-sm text-stone-400 leading-relaxed mb-6">
              These are stored encrypted on your machine. They&apos;re used to sync with Moodle and
              Gmail.
            </p>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label htmlFor="ues-user" className="text-sm font-medium text-stone-400 tracking-wide">
                  UES username
                </label>
                <input
                  id="ues-user"
                  type="text"
                  placeholder="e.g. XX12345"
                  value={uesUsername}
                  onChange={(e) => { setUesUsername(e.target.value); setError(''); }}
                  autoFocus
                  autoComplete="username"
                  className="w-full px-4 py-3 rounded-lg bg-stone-950 border border-white/10 text-stone-50 text-base outline-none placeholder:text-stone-500 transition-all focus:border-accent-500 focus:ring-[3px] focus:ring-accent-500/15"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="ues-pass" className="text-sm font-medium text-stone-400 tracking-wide">
                  UES password
                </label>
                <input
                  id="ues-pass"
                  type="password"
                  placeholder="Your Moodle password"
                  value={uesPassword}
                  onChange={(e) => { setUesPassword(e.target.value); setError(''); }}
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded-lg bg-stone-950 border border-white/10 text-stone-50 text-base outline-none placeholder:text-stone-500 transition-all focus:border-accent-500 focus:ring-[3px] focus:ring-accent-500/15"
                />
              </div>

              <div className="border-t border-white/[0.06] pt-5 mt-1">
                <div className="flex flex-col gap-2">
                  <label htmlFor="gmail-pass" className="text-sm font-medium text-stone-400 tracking-wide">
                    Gmail app password
                    <span className="font-normal text-stone-500"> (optional)</span>
                  </label>
                  <input
                    id="gmail-pass"
                    type="password"
                    placeholder="16-character app password"
                    value={gmailAppPassword}
                    onChange={(e) => setGmailAppPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-stone-950 border border-white/10 text-stone-50 text-base outline-none placeholder:text-stone-500 transition-all focus:border-accent-500 focus:ring-[3px] focus:ring-accent-500/15"
                  />
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Enable 2FA in your UES Gmail, then create an app password at{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-400 hover:text-accent-300 transition-colors"
                    >
                      myaccount.google.com/apppasswords
                    </a>
                    . You can add this later.
                  </p>
                </div>
              </div>

              {error && <p className="text-xs text-danger flex items-center gap-1">⚠ {error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                className="flex-1 px-5 py-3 rounded-lg bg-stone-700 text-stone-50 font-medium text-sm border border-white/10 hover:bg-stone-600 hover:border-white/15 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={goBack}
                disabled={isPending}
              >
                Back
              </button>
              <button
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-accent-600 text-white font-medium text-sm border border-accent-700 shadow-sm hover:bg-accent-500 hover:shadow-glow hover:-translate-y-px active:bg-accent-700 active:translate-y-0 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleCredentialsSubmit}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <span className="spinner spinner--sm" /> Encrypting…
                  </>
                ) : (
                  'Save & continue'
                )}
              </button>
            </div>
          </Card>
        )}

        {/* ── LLM Check ── */}
        {step === 'llm-check' && (
          <Card key="llm-check">
            <h2 className="text-xl font-semibold mb-2">AI assistant</h2>
            <p className="text-sm text-stone-400 leading-relaxed mb-6">
              Spear uses the Antigravity CLI for email summaries and homework draft
              generation.
            </p>

            <div className="flex items-center gap-3 p-4 rounded-lg bg-stone-800 border border-white/[0.06]">
              <span className="text-xl shrink-0">{agyAvailable ? '✅' : '⚠️'}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {agyAvailable ? 'Antigravity CLI detected' : 'Antigravity CLI not found'}
                </p>
                <p className="text-xs text-stone-400 mt-1">
                  {agyAvailable
                    ? 'AI features like email summaries and homework drafts are available.'
                    : 'AI features will be disabled. Install agy to enable them. Core sync features work without it.'}
                </p>
              </div>
            </div>

            {!agyAvailable && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/[0.08] border border-warning/20 text-sm text-yellow-300 mt-4">
                <span>💡</span>
                <span>
                  You can install the Antigravity CLI later and it will be automatically detected on
                  next launch.
                </span>
              </div>
            )}

            <button
              className="w-full mt-6 px-5 py-3 rounded-lg bg-accent-600 text-white font-medium text-sm border border-accent-700 shadow-sm hover:bg-accent-500 hover:shadow-glow hover:-translate-y-px active:bg-accent-700 active:translate-y-0 transition-all cursor-pointer"
              onClick={goNext}
            >
              {agyAvailable ? 'Continue' : 'Skip for now'}
            </button>
          </Card>
        )}

        {/* ── Complete ── */}
        {step === 'complete' && (
          <Card key="complete">
            <div className="text-center py-6">
              <div className="text-5xl mb-4">🚀</div>
              <h2 className="text-xl font-semibold mb-2">You&apos;re all set!</h2>
              <p className="text-sm text-stone-400 mb-6">
                Your vault is encrypted and credentials are saved. Spear is ready to sync
                your courses and assignments.
              </p>
              <button
                className="px-8 py-3.5 rounded-xl bg-accent-600 text-white font-medium text-base border border-accent-700 shadow-sm hover:bg-accent-500 hover:shadow-glow hover:-translate-y-px active:bg-accent-700 active:translate-y-0 transition-all cursor-pointer"
                onClick={() => router.push('/')}
              >
                Open dashboard
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
