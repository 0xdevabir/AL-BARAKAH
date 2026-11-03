export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export interface SessionUser { id: string; phone: string; email?: string | null; name: string; role: 'CUSTOMER' | 'ADMIN' | 'RIDER' | 'DOCTOR'; mfa?: boolean; totpEnabled?: boolean }

/** Where the native app keeps its refresh token. The web has no vault: it uses an httpOnly cookie. */
export interface TokenVault { get(): Promise<string | null>; set(token: string | null): Promise<void> }

const HINT = 'ab_signed_in';
const hint = {
  get: () => { try { return localStorage.getItem(HINT) === '1'; } catch { return false; } },
  set: (on: boolean) => { try { if (on) localStorage.setItem(HINT, '1'); else localStorage.removeItem(HINT); } catch { /* private mode */ } },
};

interface Session { accessToken: string; refreshToken?: string; user: SessionUser }

/** Caps every call so a stalled network or API never freezes buttons/spinners. */
const REQUEST_MS = 20_000;

function networkError(err: unknown): ApiError {
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new ApiError(0, 'TIMEOUT', 'That took too long. Please try again.');
  }
  return new ApiError(0, 'NETWORK', 'No connection. Please check your internet and try again.');
}

/** The access token lives only in memory, so injected scripts have nothing lasting to steal. */
export class ApiClient {
  user = $state<SessionUser | null>(null);
  ready = $state(false);
  private access: string | null = null;
  private refreshing: Promise<boolean> | null = null;

  constructor(readonly base: string, private readonly vault?: TokenVault) {}

  private headers(body: boolean): Record<string, string> {
    return {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(this.access ? { authorization: `Bearer ${this.access}` } : {}),
      ...(this.vault ? { 'x-client': 'native' } : {}),
    };
  }

  private async adopt(s: Session) {
    this.access = s.accessToken;
    this.user = s.user;
    hint.set(true);
    if (this.vault && s.refreshToken) await this.vault.set(s.refreshToken);
  }

  private clear() {
    this.access = null;
    this.user = null;
    hint.set(false);
    void this.vault?.set(null);
  }

  private call(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.base}${path}`, { ...init, signal: AbortSignal.timeout(REQUEST_MS) });
  }

  /** Concurrent 401s share one refresh, because a refresh token works only once. */
  private refresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      try {
        const token = this.vault ? await this.vault.get() : null;
        if (this.vault && !token) return false;
        const res = await this.call('/auth/refresh', {
          method: 'POST', credentials: 'include',
          headers: this.vault ? { 'content-type': 'application/json', 'x-client': 'native' } : {},
          ...(token ? { body: JSON.stringify({ refreshToken: token }) } : {}),
        });
        if (res.status === 401 || res.status === 403) { this.clear(); return false; }
        if (!res.ok) return false; // A server or network fault is not a reason to sign the customer out.
        await this.adopt(await res.json());
        return true;
      } catch {
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** Restores the session on launch. Always marks ready so pages never wait forever. */
  async restore() {
    try {
      const signedIn = this.vault
        ? await Promise.race([
            this.vault.get(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
          ])
        : hint.get();
      if (signedIn) await this.refresh();
    } finally {
      this.ready = true;
    }
  }

  async request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
    let res: Response;
    try {
      res = await this.call(path, {
        method, credentials: 'include', headers: this.headers(body !== undefined),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw networkError(err);
    }
    if (res.status === 401 && retry && (await this.refresh())) return this.request<T>(method, path, body, false);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? 'Something went wrong. Please try again.');
    return data as T;
  }

  get = <T>(path: string) => this.request<T>('GET', path);
  post = <T>(path: string, body: unknown = {}) => this.request<T>('POST', path, body);
  patch = <T>(path: string, body: unknown) => this.request<T>('PATCH', path, body);
  put = <T>(path: string, body: unknown) => this.request<T>('PUT', path, body);
  del = <T>(path: string) => this.request<T>('DELETE', path);

  requestOtp(phone: string) {
    return this.post('/auth/otp/request', { phone });
  }

  async verifyOtp(phone: string, code: string, name?: string) {
    await this.adopt(await this.post<Session>('/auth/otp/verify', { phone, code, ...(name ? { name } : {}) }));
    return this.user!;
  }

  requestEmailOtp(email: string, phone: string) {
    return this.post('/auth/otp/email/request', { email, phone });
  }

  async verifyEmailOtp(email: string, phone: string, code: string, name?: string) {
    await this.adopt(await this.post<Session>('/auth/otp/email/verify', { email, phone, code, ...(name ? { name } : {}) }));
    return this.user!;
  }

  async demoLogin(role: string) {
    await this.adopt(await this.post<Session>('/auth/demo-login', { role }));
  }

  async verifyTotp(code: string) {
    const refreshToken = this.vault ? await this.vault.get() : undefined;
    await this.adopt(await this.post<Session>('/auth/totp/verify', { code, ...(refreshToken ? { refreshToken } : {}) }));
  }

  async logout() {
    const refreshToken = this.vault ? await this.vault.get() : undefined;
    await this.post('/auth/logout', refreshToken ? { refreshToken } : {}).catch(() => undefined);
    this.clear();
  }
}
