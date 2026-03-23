// js/auth.js
// ─────────────────────────────────────────────────────────
// Auth gate — shown when user is not logged in.
// On successful login/signup, calls App.boot().
// ─────────────────────────────────────────────────────────

const AuthUI = {
  _mode: 'login', // 'login' | 'signup'

  show() {
    document.getElementById('app').style.display = 'none';
    document.querySelector('.fab')?.style && (document.querySelector('.fab').style.display = 'none');
    document.getElementById('offline-banner')?.remove();

    let el = document.getElementById('auth-screen');
    if (!el) {
      el = document.createElement('div');
      el.id = 'auth-screen';
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
    AuthUI._render(el);
  },

  hide() {
    const el = document.getElementById('auth-screen');
    if (el) el.style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    const fab = document.querySelector('.fab');
    if (fab) fab.style.display = 'flex';
  },

  _render(container) {
    const isLogin = AuthUI._mode === 'login';
    container.innerHTML = `
      <style>
        #auth-screen {
          position: fixed; inset: 0; background: var(--bg);
          flex-direction: column; align-items: center; justify-content: center;
          padding: 24px; z-index: 500; gap: 0;
        }
        .auth-logo {
          font-family: var(--font-pixel); font-size: 14px;
          color: var(--p1); letter-spacing: 0.1em;
          text-shadow: 2px 2px 0 var(--p2);
          margin-bottom: 8px;
        }
        .auth-sub {
          font-family: var(--font-vt); font-size: 18px;
          color: var(--text2); margin-bottom: 32px; text-align: center;
        }
        .auth-card {
          width: 100%; max-width: 340px;
          background: var(--bg2); border: 1px solid var(--border);
          border-top: 3px solid var(--p1); padding: 24px 20px;
        }
        .auth-title {
          font-family: var(--font-pixel); font-size: 8px;
          color: var(--p1); letter-spacing: 0.05em; margin-bottom: 20px;
        }
        .auth-field { margin-bottom: 14px; }
        .auth-label {
          font-family: var(--font-pixel); font-size: 6px;
          color: var(--text2); letter-spacing: 0.08em; display: block; margin-bottom: 6px;
        }
        .auth-input {
          width: 100%; background: var(--surface); border: 1px solid var(--border);
          color: var(--text); font-family: var(--font-sans); font-size: 14px;
          padding: 10px 12px; outline: none; transition: border-color 0.15s;
        }
        .auth-input:focus { border-color: var(--p1); }
        .auth-input::placeholder { color: var(--text3); }
        .auth-btn {
          width: 100%; padding: 13px; background: var(--a1); color: var(--bg);
          border: none; font-family: var(--font-pixel); font-size: 8px;
          cursor: pointer; letter-spacing: 0.05em; margin-top: 6px;
          box-shadow: 3px 3px 0 var(--p2); transition: all 0.1s;
        }
        .auth-btn:hover { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 var(--p2); }
        .auth-btn:active { transform: translate(1px,1px); box-shadow: 0 0 0; }
        .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .auth-google-btn {
          width: 100%; padding: 11px; background: transparent; color: var(--text2);
          border: 1px solid var(--border); font-family: var(--font-pixel); font-size: 7px;
          cursor: pointer; letter-spacing: 0.05em; margin-top: 8px; transition: all 0.15s;
        }
        .auth-google-btn:hover { border-color: var(--p1); color: var(--p1); }
        .auth-toggle {
          font-family: var(--font-vt); font-size: 17px; color: var(--text3);
          text-align: center; margin-top: 16px; cursor: pointer;
        }
        .auth-toggle span { color: var(--p1); text-decoration: underline; cursor: pointer; }
        .auth-error {
          margin-top: 10px; padding: 8px 12px;
          background: rgba(255,61,61,0.08); border: 1px solid rgba(255,61,61,0.3);
          font-family: var(--font-vt); font-size: 16px; color: #ff6060; display: none;
        }
        .auth-scanlines {
          position: fixed; inset: 0; pointer-events: none;
          background-image: repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.1) 2px,rgba(0,0,0,0.1) 3px);
        }
      </style>
      <div class="auth-scanlines"></div>
      <div class="auth-logo">nudget&#10022;</div>
      <div class="auth-sub">calm. detailed. yours.</div>
      <div class="auth-card">
        <div class="auth-title">${isLogin ? 'SIGN IN' : 'CREATE ACCOUNT'}</div>
        ${!isLogin ? `
          <div class="auth-field">
            <label class="auth-label">YOUR NAME</label>
            <input class="auth-input" id="auth-name" type="text" placeholder="how should we greet you?" />
          </div>` : ''}
        <div class="auth-field">
          <label class="auth-label">EMAIL</label>
          <input class="auth-input" id="auth-email" type="email" placeholder="your@email.com" />
        </div>
        <div class="auth-field">
          <label class="auth-label">PASSWORD</label>
          <input class="auth-input" id="auth-password" type="password" placeholder="${isLogin ? 'your password' : 'min. 8 characters'}" />
        </div>
        <button class="auth-btn" id="auth-submit">${isLogin ? 'SIGN IN &#10022;' : 'CREATE ACCOUNT &#10022;'}</button>
        <button class="auth-google-btn" id="auth-google">CONTINUE WITH GOOGLE</button>
        <div class="auth-error" id="auth-error"></div>
        <div class="auth-toggle">
          ${isLogin
            ? `Don't have an account? <span id="auth-switch">Sign up</span>`
            : `Already have an account? <span id="auth-switch">Sign in</span>`}
        </div>
      </div>
    `;

    document.getElementById('auth-submit').addEventListener('click', AuthUI._submit);
    document.getElementById('auth-google').addEventListener('click', AuthUI._googleSignIn);
    document.getElementById('auth-switch').addEventListener('click', () => {
      AuthUI._mode = isLogin ? 'signup' : 'login';
      AuthUI._render(container);
    });

    // Enter key submits
    container.querySelectorAll('.auth-input').forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') AuthUI._submit(); });
    });
  },

  async _submit() {
    const btn      = document.getElementById('auth-submit');
    const errEl    = document.getElementById('auth-error');
    const email    = document.getElementById('auth-email')?.value.trim();
    const password = document.getElementById('auth-password')?.value;
    const name     = document.getElementById('auth-name')?.value.trim() ?? '';

    if (!email || !password) { AuthUI._showError('please fill in all fields'); return; }

    btn.disabled    = true;
    btn.textContent = AuthUI._mode === 'login' ? 'SIGNING IN...' : 'CREATING...';
    errEl.style.display = 'none';

    try {
      if (AuthUI._mode === 'login') {
        await Auth.signIn(email, password);
      } else {
        if (password.length < 8) { AuthUI._showError('password must be at least 8 characters'); btn.disabled = false; return; }
        await Auth.signUp(email, password, name);
      }
      // Auth state change fires App.boot() via onAuthChange listener
    } catch (err) {
      AuthUI._showError(err.message || 'something went wrong. try again.');
      btn.disabled    = false;
      btn.textContent = AuthUI._mode === 'login' ? 'SIGN IN &#10022;' : 'CREATE ACCOUNT &#10022;';
    }
  },

  async _googleSignIn() {
    try {
      await Auth.signInGoogle();
    } catch (err) {
      AuthUI._showError(err.message || 'google sign in failed');
    }
  },

  _showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  },
};