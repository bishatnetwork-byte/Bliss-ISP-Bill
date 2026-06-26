var SHOW_PASSWORD_FIELD = Boolean(window.RENULT_PORTAL_CONFIG && window.RENULT_PORTAL_CONFIG.showPasswordField);
var THEME_STORAGE_KEY = "renult_college_theme";

function portalConfig() {
  return window.RENULT_PORTAL_CONFIG || {};
}

function apiBase() {
  return (portalConfig().apiBaseUrl || "https://api.bliss-isp.com").replace(/\/$/, "");
}

function routerName() {
  return portalConfig().routerName || "renult-campus";
}

function getUrlParameter(name) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  const regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
  const results = regex.exec(location.search);
  return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(value) {
  return `UGX ${Number(value || 0).toLocaleString()}`;
}

function setVoucherCredentials(code) {
  const voucherCode = String(code || "").trim();
  const usernameInput = document.getElementById("voucherCode");
  const passwordInput = document.getElementById("loginPassword");
  if (!voucherCode || !usernameInput || !passwordInput) return false;
  usernameInput.value = voucherCode;
  passwordInput.value = voucherCode;
  RenultVoucherStore.saveManual(voucherCode);
  return true;
}

function setupLoginForm() {
  const passwordGroup = document.querySelector(".password-group");
  const usernameInput = document.getElementById("voucherCode");
  const passwordInput = document.getElementById("loginPassword");
  if (!usernameInput || !passwordInput) return;

  if (SHOW_PASSWORD_FIELD) {
    passwordGroup.hidden = false;
  } else {
    passwordGroup.hidden = true;
    passwordInput.value = usernameInput.value;
    usernameInput.addEventListener("input", function () {
      passwordInput.value = usernameInput.value;
    });
  }

  document.getElementById("loginForm")?.addEventListener("submit", function () {
    RenultVoucherStore.saveManual(usernameInput.value);
  });
}

function autoLogin() {
  const cardParam = getUrlParameter("card") || getUrlParameter("v");
  if (cardParam && document.login) {
    document.login.username.value = cardParam;
    document.login.password.value = cardParam;
    document.login.submit();
  }

  const usernameParam = getUrlParameter("u") || getUrlParameter("username");
  const passwordParam = getUrlParameter("p") || getUrlParameter("password");
  if (usernameParam && passwordParam && document.login) {
    document.login.username.value = usernameParam;
    document.login.password.value = passwordParam;
    document.login.submit();
  }
}

const RenultVoucherStore = {
  key: "renult_college_vouchers",
  manualKey: "renult_college_voucher",
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || "[]");
    } catch {
      return [];
    }
  },
  save(voucher) {
    if (!voucher || !voucher.voucherCode) return false;
    const items = this.getAll().filter((item) => item.voucherCode !== voucher.voucherCode);
    items.unshift({
      voucherCode: voucher.voucherCode,
      packageName: voucher.packageName || "Renult package",
      packageDuration: voucher.packageDuration || "",
      packagePrice: voucher.packagePrice || "",
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem(this.key, JSON.stringify(items.slice(0, 6)));
    this.saveManual(voucher.voucherCode);
    return true;
  },
  saveManual(code) {
    const value = String(code || "").trim();
    if (!value) return false;
    localStorage.setItem(this.manualKey, value);
    return true;
  },
  latest() {
    return localStorage.getItem(this.manualKey) || this.getAll()[0]?.voucherCode || "";
  },
  clear() {
    localStorage.removeItem(this.manualKey);
    localStorage.removeItem(this.key);
  },
};

function renderVoucherRecovery() {
  const target = document.getElementById("searchVoucher");
  if (!target) return;
  target.innerHTML = `
    <a class="find-voucher-trigger" href="./voucher.html">Already have voucher?</a>
  `;
}

function setupSavedVoucherPage() {
  const trigger = document.getElementById("useSavedVoucherTrigger");
  const message = document.getElementById("savedVoucherMessage");
  if (!trigger) return;

  trigger.addEventListener("click", function () {
    const voucher = RenultVoucherStore.latest();
    if (!setVoucherCredentials(voucher)) {
      if (message) message.textContent = "No saved voucher was found on this device.";
      return;
    }
    if (message) message.textContent = "Saved voucher loaded. Tap Connect to go online.";
    document.getElementById("voucherCode")?.focus();
  });
}

function renderVoucherResults(vouchers) {
  const target = document.getElementById("voucherSearchResults");
  if (!target) return;

  if (!vouchers.length) {
    target.innerHTML = `<div class="hotspot-message-container">No vouchers were found for that number.</div>`;
    return;
  }

  target.innerHTML = vouchers.map((voucher) => `
    <article class="voucher-result-card">
      <div>
        <span class="voucher-result-label">Voucher</span>
        <strong class="voucher-result-code">${escapeHtml(voucher.voucher_code)}</strong>
      </div>
      <div class="voucher-result-meta">
        <span>${escapeHtml(voucher.profile || "WiFi package")}</span>
        <span>${formatMoney(voucher.amount)}</span>
        <span>${escapeHtml(voucher.status || "READY")}</span>
      </div>
      <button class="package-buy-button button-primary" type="button" data-connect-voucher="${escapeHtml(voucher.voucher_code)}">Connect</button>
    </article>
  `).join("");

  target.querySelectorAll("[data-connect-voucher]").forEach((button) => {
    button.addEventListener("click", function () {
      if (!setVoucherCredentials(button.getAttribute("data-connect-voucher"))) return;
      document.getElementById("loginForm")?.requestSubmit();
    });
  });
}

function setupRealVoucherFinder() {
  const form = document.getElementById("findVoucherForm");
  const results = document.getElementById("voucherSearchResults");
  if (!form || !results) return;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const phone = document.getElementById("findVoucherPhone")?.value.trim();
    if (!phone) return;

    results.innerHTML = `<div class="hotspot-message-container">Searching for vouchers...</div>`;

    try {
      const response = await fetch(
        `${apiBase()}/portal/${encodeURIComponent(routerName())}/vouchers/find?phone_number=${encodeURIComponent(phone)}`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.message || "Voucher search failed");
      renderVoucherResults(payload.vouchers || []);
    } catch (error) {
      results.innerHTML = `<div class="hotspot-message-container"><p class="error-info">${escapeHtml(error.message || "Could not find vouchers. Please try again.")}</p></div>`;
    }
  });
}

function setupThemeToggle() {
  const root = document.documentElement;
  const button = document.getElementById("themeToggleButton");
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const initialTheme = savedTheme || root.dataset.theme || "dark";

  root.dataset.theme = initialTheme;

  function updateLabel() {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    button?.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    button?.setAttribute("title", `Switch to ${nextTheme} mode`);
  }

  updateLabel();
  button?.addEventListener("click", function () {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    updateLabel();
  });
}

document.addEventListener("DOMContentLoaded", function () {
  setupLoginForm();
  renderVoucherRecovery();
  setupSavedVoucherPage();
  setupRealVoucherFinder();
  setupThemeToggle();
  autoLogin();
});
