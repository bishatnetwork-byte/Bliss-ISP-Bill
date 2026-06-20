/**
 * MikroTik hotspot auth matches hotspot_internal_boaz exactly.
 * - Voucher: empty password first (CHAP), then auto-retry with password = username.
 * - Member: separate form, uses typed password only (no voucher retry).
 */
(function (global) {
    var voucherStatePrefix = '__voucher_state__:';

    function readVoucherState() {
        try {
            if (global.name && global.name.indexOf(voucherStatePrefix) === 0) {
                return JSON.parse(global.name.substring(voucherStatePrefix.length)) || {};
            }
        } catch (e) { /* ignore */ }
        return {};
    }

    function writeVoucherState(state) {
        try {
            var hasKeys = false;
            for (var key in state) {
                if (Object.prototype.hasOwnProperty.call(state, key)) {
                    hasKeys = true;
                    break;
                }
            }
            global.name = hasKeys ? (voucherStatePrefix + JSON.stringify(state)) : '';
        } catch (e) { /* ignore */ }
    }

    function getVoucherStorage(key) {
        try {
            var stored = localStorage.getItem(key);
            if (stored !== null) return stored;
        } catch (e) { /* ignore */ }
        var state = readVoucherState();
        return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null;
    }

    function setVoucherStorage(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
        var state = readVoucherState();
        state[key] = value;
        writeVoucherState(state);
    }

    function removeVoucherStorage(key) {
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
        var state = readVoucherState();
        if (Object.prototype.hasOwnProperty.call(state, key)) {
            delete state[key];
            writeVoucherState(state);
        }
    }

    /** @param {string} [usernameOverride] - when restoring from storage */
    function setVoucherCredentials(usernameEl, passwordEl, mode, usernameOverride) {
        var user = usernameOverride !== undefined && usernameOverride !== null
            ? String(usernameOverride)
            : (usernameEl ? usernameEl.value : '');
        if (usernameEl) usernameEl.value = user;
        if (!passwordEl) return;
        passwordEl.value = mode === 'empty' ? '' : user;
    }

    function rememberVoucherAttempt(username, mode) {
        if (!username) return;
        setVoucherStorage('voucher-attempt-username', username);
        setVoucherStorage('voucher-attempt-mode', mode || 'empty');
    }

    function clearVoucherAttempt() {
        removeVoucherStorage('voucher-attempt-username');
        removeVoucherStorage('voucher-attempt-mode');
    }

    function setLoginMode(mode) {
        setVoucherStorage('last-login-mode', mode);
    }

    function onVoucherUsernameInput(passwordEl) {
        if (passwordEl) passwordEl.value = '';
        clearVoucherAttempt();
    }

    function enterVoucherMode(usernameEl, passwordEl) {
        if (passwordEl) {
            passwordEl.type = 'hidden';
            passwordEl.value = '';
        }
        onVoucherUsernameInput(passwordEl);
    }

    function enterMemberMode(passwordEl) {
        if (passwordEl) {
            passwordEl.type = 'password';
            passwordEl.value = '';
        }
        clearVoucherAttempt();
        setLoginMode('member');
    }

    function submitChap(sendinForm, username, passwordPlain, chapId, chapChallenge) {
        sendinForm.username.value = username;
        sendinForm.password.value = hexMD5(chapId + passwordPlain + chapChallenge);
        sendinForm.submit();
    }

    /**
     * Same as boaz doVoucherLogin()
     */
    function doVoucherLogin(opts) {
        var sendin = opts.sendin;
        var usernameEl = opts.usernameEl;
        var passwordEl = opts.passwordEl;
        var chapId = opts.chapId;
        var chapChallenge = opts.chapChallenge;
        var loginBtn = opts.loginButton;

        if (loginBtn) {
            loginBtn.classList.add('connecting');
            var txt = loginBtn.querySelector('.btn-text');
            var spn = loginBtn.querySelector('.btn-spinner');
            if (txt) txt.textContent = 'Connecting...';
            if (spn) spn.style.display = 'inline-block';
            loginBtn.disabled = true;
        }

        setLoginMode('voucher');
        var voucherUsername = usernameEl ? usernameEl.value : '';
        var voucherPassword = passwordEl ? passwordEl.value : '';
        rememberVoucherAttempt(voucherUsername, voucherPassword === '' ? 'empty' : 'username');
        submitChap(sendin, voucherUsername, voucherPassword, chapId, chapChallenge);
        return false;
    }

    /**
     * Same as boaz doMemberLogin()
     */
    function doMemberLogin(opts) {
        var sendin = opts.sendin;
        var usernameEl = opts.usernameEl;
        var passwordEl = opts.passwordEl;
        var chapId = opts.chapId;
        var chapChallenge = opts.chapChallenge;

        setLoginMode('member');
        clearVoucherAttempt();
        var user = usernameEl ? usernameEl.value : '';
        var pass = passwordEl ? passwordEl.value : '';
        submitChap(sendin, user, pass, chapId, chapChallenge);
        return false;
    }

    /**
     * Page load: pending voucher, failed voucher retry (not member errors).
     */
    function initVoucherLoginRetry(config) {
        var usernameEl = config.usernameEl;
        var passwordEl = config.passwordEl;
        var voucherForm = config.voucherForm;
        var hasError = config.hasError;
        var onSwitchVoucherTab = config.onSwitchVoucherTab;

        if (!usernameEl || !voucherForm) return;

        if (usernameEl && passwordEl) {
            usernameEl.addEventListener('input', function () {
                passwordEl.value = '';
                clearVoucherAttempt();
            });
        }

        var pendingVoucher = getVoucherStorage('pending-voucher');
        var pendingMode = getVoucherStorage('pending-voucher-mode') || 'empty';
        if (pendingVoucher) {
            setVoucherCredentials(usernameEl, passwordEl, pendingMode, pendingVoucher);
            removeVoucherStorage('pending-voucher');
            removeVoucherStorage('pending-voucher-mode');
            if (onSwitchVoucherTab) onSwitchVoucherTab();
            setTimeout(function () {
                if (config.doVoucherLogin) config.doVoucherLogin();
                else voucherForm.submit();
            }, 200);
            return;
        }

        if (hasError) {
            var lastMode = getVoucherStorage('last-login-mode');
            if (lastMode === 'member') {
                return;
            }

            var attemptUser = getVoucherStorage('voucher-attempt-username') || (usernameEl ? usernameEl.value : '');
            var attemptMode = getVoucherStorage('voucher-attempt-mode') || 'empty';
            if (attemptUser) {
                if (onSwitchVoucherTab) onSwitchVoucherTab();
                if (attemptMode !== 'username') {
                    setVoucherCredentials(usernameEl, passwordEl, 'username', attemptUser);
                    setVoucherStorage('voucher-attempt-username', attemptUser);
                    setVoucherStorage('voucher-attempt-mode', 'username');
                    setTimeout(function () {
                        if (config.doVoucherLogin) config.doVoucherLogin();
                        else voucherForm.submit();
                    }, 200);
                    return;
                }
                setVoucherCredentials(usernameEl, passwordEl, 'username', attemptUser);
                clearVoucherAttempt();
                return;
            }
        }

        var savedUser = getVoucherStorage('voucher-attempt-username');
        var savedMode = getVoucherStorage('voucher-attempt-mode') || 'empty';
        if (savedUser) {
            setVoucherCredentials(usernameEl, passwordEl, savedMode, savedUser);
        }
    }

    function setPendingVoucher(voucher, mode) {
        setVoucherStorage('pending-voucher', voucher);
        setVoucherStorage('pending-voucher-mode', mode || 'empty');
    }

    function boot(config) {
        var run = function () {
            initVoucherLoginRetry(config);
        };
        if (global.document && global.document.addEventListener) {
            if (global.document.readyState === 'loading') {
                global.document.addEventListener('DOMContentLoaded', run);
            } else {
                run();
            }
        } else {
            run();
        }
    }

    global.VoucherAuth = {
        rememberVoucherAttempt: rememberVoucherAttempt,
        clearVoucherAttempt: clearVoucherAttempt,
        setVoucherCredentials: setVoucherCredentials,
        onVoucherUsernameInput: onVoucherUsernameInput,
        enterVoucherMode: enterVoucherMode,
        enterMemberMode: enterMemberMode,
        doVoucherLogin: doVoucherLogin,
        doMemberLogin: doMemberLogin,
        initVoucherLoginRetry: initVoucherLoginRetry,
        boot: boot,
        setPendingVoucher: setPendingVoucher,
        getVoucherStorage: getVoucherStorage,
        setVoucherStorage: setVoucherStorage,
        removeVoucherStorage: removeVoucherStorage,
        setLoginMode: setLoginMode
    };
})(typeof window !== 'undefined' ? window : this);
