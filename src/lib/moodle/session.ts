/**
 * Moodle session manager — HTTP-based authentication with UES Moodle.
 * Handles login, cookie management, sesskey extraction, and API calls.
 */

export class MoodleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoodleAuthError';
  }
}

export class MoodleSessionExpiredError extends Error {
  constructor(message: string = 'Moodle session expired') {
    super(message);
    this.name = 'MoodleSessionExpiredError';
  }
}

export class MoodleApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoodleApiError';
  }
}

export interface MoodleSession {
  moodleSessionCookie: string;
  sesskey: string;
  userId: number;
  createdAt: Date;
}

export interface MoodleDownload {
  bytes: Buffer;
  contentType: string | null;
  contentLength: number | null;
}

const SESSION_MAX_AGE_MS = 90 * 60 * 1000; // 90 minutes (conservative; Moodle timeout is 2h)

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Checks if a session is expired (older than 90 minutes).
 */
export function isSessionExpired(session: MoodleSession): boolean {
  return Date.now() - session.createdAt.getTime() > SESSION_MAX_AGE_MS;
}

/**
 * Extracts the MoodleSession cookie value from response headers.
 */
function extractMoodleCookie(headers: Headers): string | null {
  let cookies: string[] = [];

  if (typeof headers.getSetCookie === 'function') {
    cookies = headers.getSetCookie();
  } else {
    const setCookieStr = headers.get('set-cookie');
    if (setCookieStr) {
      cookies = setCookieStr.split(',').map((s) => s.trim());
    }
  }

  for (const cookieStr of cookies) {
    const match = cookieStr.match(/MoodleSession[^=]*=[^;]+/i);
    if (match) {
      return match[0];
    }
  }

  return null;
}

export class SessionManager {
  private baseUrl: string;
  private currentSession: MoodleSession | null = null;

  constructor(baseUrl: string = 'https://campus.ues.edu.sv') {
    this.baseUrl = baseUrl;
  }

  /** Returns the current cached session. */
  getSession(): MoodleSession | null {
    return this.currentSession;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Fetches an authenticated Moodle URL without following login redirects. */
  async download(
    session: MoodleSession,
    url: string,
    maxBytes: number,
  ): Promise<MoodleDownload> {
    if (isSessionExpired(session)) throw new MoodleSessionExpiredError();

    const { logActivity } = await import('@/lib/activity-log');
    const startedAt = Date.now();
    let currentUrl = url;
    let response: Response | undefined;
    for (let redirects = 0; redirects < 5; redirects++) {
      try {
        response = await fetch(currentUrl, {
          headers: { 'User-Agent': DEFAULT_USER_AGENT, Cookie: session.moodleSessionCookie },
          redirect: 'manual',
        });
      } catch (error) {
        logActivity({ category: 'file_download', level: 'error', message: error instanceof Error ? error.message : 'Download request failed', method: 'GET', url: currentUrl, durationMs: Date.now() - startedAt });
        throw error;
      }
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location') || '';
      if (location.includes('/login/')) throw new MoodleSessionExpiredError();
      if (!location) throw new MoodleApiError(`Download redirect has no location: ${response.status}`);
      const nextUrl = new URL(location, currentUrl);
      if (nextUrl.origin !== new URL(this.baseUrl).origin) {
        throw new MoodleApiError('Download redirected outside Moodle');
      }
      currentUrl = nextUrl.toString();
    }
    if (!response || (response.status >= 300 && response.status < 400)) {
      logActivity({ category: 'file_download', level: 'error', message: 'Download exceeded redirect limit', method: 'GET', url, durationMs: Date.now() - startedAt });
      throw new MoodleApiError('Download exceeded redirect limit');
    }
    if (!response.ok) {
      logActivity({ category: 'file_download', level: 'error', message: `Download HTTP Error: ${response.status}`, method: 'GET', url: currentUrl, statusCode: response.status, durationMs: Date.now() - startedAt });
      throw new MoodleApiError(`Download HTTP Error: ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      logActivity({ category: 'file_download', level: 'warning', message: 'Download skipped: file exceeds size limit', method: 'GET', url: currentUrl, statusCode: response.status, durationMs: Date.now() - startedAt, details: { contentLength, maxBytes } });
      throw new MoodleApiError(`File exceeds configured limit of ${maxBytes} bytes`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) {
      logActivity({ category: 'file_download', level: 'warning', message: 'Download skipped: file exceeds size limit', method: 'GET', url: currentUrl, statusCode: response.status, durationMs: Date.now() - startedAt, details: { contentLength: bytes.length, maxBytes } });
      throw new MoodleApiError(`File exceeds configured limit of ${maxBytes} bytes`);
    }

    logActivity({ category: 'file_download', message: 'Downloaded Moodle file', method: 'GET', url: currentUrl, statusCode: response.status, durationMs: Date.now() - startedAt, details: { bytes: bytes.length, contentType: response.headers.get('content-type') } });

    return {
      bytes,
      contentType: response.headers.get('content-type'),
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
    };
  }

  /** Clears the current cached session. */
  clearSession(): void {
    this.currentSession = null;
  }

  /**
   * Performs the full Moodle login flow via HTTP.
   *
   * 1. GET /login/index.php → extract logintoken + initial cookie
   * 2. POST credentials → capture new cookie on redirect
   * 3. GET /my/ → extract sesskey + userId
   */
  async login(username: string, password: string): Promise<MoodleSession> {
    const loginUrl = `${this.baseUrl}/login/index.php`;

    // Step 1: GET login page
    const getRes = await fetch(loginUrl, {
      method: 'GET',
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
      redirect: 'manual',
    });

    let moodleCookie = extractMoodleCookie(getRes.headers);
    if (!moodleCookie) {
      throw new MoodleAuthError('Failed to obtain initial MoodleSession cookie');
    }

    const html = await getRes.text();
    const loginTokenMatch = html.match(
      /<input\s+type="hidden"\s+name="logintoken"\s+value="([^"]+)"/i,
    );
    if (!loginTokenMatch) {
      throw new MoodleAuthError('Could not find logintoken in login page');
    }
    const logintoken = loginTokenMatch[1];

    // Step 2: POST login form and manually follow redirects
    const body = new URLSearchParams();
    body.append('username', username);
    body.append('password', password);
    body.append('logintoken', logintoken);
    body.append('anchor', '');

    let currentUrl = loginUrl;
    let res = await fetch(currentUrl, {
      method: 'POST',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: moodleCookie,
      },
      body: body.toString(),
      redirect: 'manual',
    });

    let redirectCount = 0;
    while ((res.status === 302 || res.status === 303) && redirectCount < 5) {
      const newCookie = extractMoodleCookie(res.headers);
      if (newCookie) {
        moodleCookie = newCookie;
      }
      const loc = res.headers.get('location');
      if (!loc) break;
      currentUrl = loc;
      res = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Cookie: moodleCookie,
        },
        redirect: 'manual',
      });
      redirectCount++;
    }

    if (!currentUrl.includes('/my/')) {
      // If we didn't end up on the dashboard, login failed
      const finalHtml = await res.text();
      if (finalHtml.includes('logintoken')) {
        throw new MoodleAuthError('Login failed: Invalid credentials or CAPTCHA required');
      }
      throw new MoodleAuthError(`Login failed. Ended up at ${currentUrl}`);
    }

    const myHtml = await res.text();

    // Extract sesskey
    const sesskeyMatch =
      myHtml.match(/"sesskey":"([^"]+)"/) ||
      myHtml.match(/<input\s+type="hidden"\s+name="sesskey"\s+value="([^"]+)"/i);

    if (!sesskeyMatch) {
      throw new MoodleAuthError('Login succeeded but could not extract sesskey');
    }
    const sesskey = sesskeyMatch[1];

    // Extract userId
    let userId = 0;
    const userIdMatch =
      myHtml.match(/"USER":\{"id":(\d+)/) ||
      myHtml.match(/user\/profile\.php\?id=(\d+)/);
    if (userIdMatch) {
      userId = parseInt(userIdMatch[1], 10);
    }

    const session: MoodleSession = {
      moodleSessionCookie: moodleCookie,
      sesskey,
      userId,
      createdAt: new Date(),
    };

    this.currentSession = session;
    return session;
  }

  /**
   * Returns a valid session — uses cache if not expired, otherwise re-logs in.
   */
  async ensureSession(username: string, password: string): Promise<MoodleSession> {
    if (this.currentSession && !isSessionExpired(this.currentSession)) {
      return this.currentSession;
    }
    return this.login(username, password);
  }

  /**
   * Calls a Moodle Web Service API method via /lib/ajax/service.php.
   *
   * @param session Active Moodle session
   * @param methodName The WS method name (e.g. 'core_enrol_get_users_courses')
   * @param args Method arguments
   * @returns The `data` field from the first response element
   */
  async callApi<T>(
    session: MoodleSession,
    methodName: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    if (isSessionExpired(session)) {
      throw new MoodleSessionExpiredError();
    }

    const apiUrl = `${this.baseUrl}/lib/ajax/service.php?sesskey=${session.sesskey}&info=${methodName}`;
    const payload = [{ index: 0, methodname: methodName, args }];

    const { logActivity } = await import('@/lib/activity-log');
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          'Content-Type': 'application/json',
          Cookie: session.moodleSessionCookie,
          Accept: 'application/json, text/javascript, */*; q=0.01',
        },
        body: JSON.stringify(payload),
        redirect: 'manual',
      });
    } catch (error) {
      logActivity({ category: 'moodle_api', level: 'error', message: error instanceof Error ? error.message : 'Moodle API request failed', method: 'POST', url: apiUrl, durationMs: Date.now() - startedAt, details: { methodName } });
      throw error;
    }
    logActivity({ category: 'moodle_api', level: response.ok ? 'info' : 'error', message: `Moodle API: ${methodName}`, method: 'POST', url: apiUrl, statusCode: response.status, durationMs: Date.now() - startedAt });

    // Detect session expiration via redirect to login
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location && location.includes('/login/')) {
        throw new MoodleSessionExpiredError();
      }
    }

    if (!response.ok) {
      throw new MoodleApiError(`API HTTP Error: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();

    // Check for unexpected HTML (login page)
    if (responseText.includes('login/index.php') && responseText.includes('<html')) {
      throw new MoodleSessionExpiredError();
    }

    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new MoodleApiError('Failed to parse API response as JSON');
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new MoodleApiError('Unexpected API response format');
    }

    const result = data[0] as {
      error?: boolean;
      exception?: { message?: string };
      data?: T;
    };

    if (result.error === true) {
      throw new MoodleApiError(result.exception?.message || 'Unknown Moodle API error');
    }

    if (result.exception) {
      throw new MoodleApiError(result.exception.message || 'Moodle API exception');
    }

    return result.data as T;
  }
}
