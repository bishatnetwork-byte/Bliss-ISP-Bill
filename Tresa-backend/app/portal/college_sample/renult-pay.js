const RenultPortal = {
  config: window.RENULT_PORTAL_CONFIG || {},
  selectedPackage: null,

  apiBase() {
    return (this.config.apiBaseUrl || "https://api.renult.xyz").replace(/\/$/, "");
  },

  routerName() {
    return this.config.routerName || "renult-campus";
  },

  money(value) {
    return `UGX ${Number(value || 0).toLocaleString()}`;
  },

  normalizePackage(item) {
    return {
      id: String(item.id ?? item.package_id ?? item.name),
      name: item.name || item.profile || "WiFi package",
      duration: item.duration || item.validity || item.time_limit || item.uptime || "Internet access",
      amount: Number(item.amount ?? item.price ?? item.cost ?? 0),
      raw: item,
    };
  },

  async fetchPackages() {
    const url = `${this.apiBase()}/portal/${encodeURIComponent(this.routerName())}/packages`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Package request failed (${response.status})`);
    const payload = await response.json();
    const rows = Array.isArray(payload)
      ? payload
      : payload.packages || payload.data?.voucher || payload.data || [];
    if (!Array.isArray(rows)) throw new Error("Package response was not a list");
    return rows.map((item) => this.normalizePackage(item));
  },

  async init() {
    document.getElementById("support-phone").textContent = this.config.supportPhone || "0700 000 000";
    let packages = [];
    try {
      packages = await this.fetchPackages();
    } catch (error) {
      console.error("Package request failed:", error);
      this.showPackageError(error);
      this.bindModal();
      return;
    }
    this.renderPackages(packages);
    this.bindModal();
  },

  showPackageError(error) {
    const loader = document.getElementById("packageOptionsLoading");
    const target = document.getElementById("packageOptions");
    if (loader) loader.hidden = true;
    if (!target) return;
    target.innerHTML = `<div class="hotspot-message-container"><p class="error-info">${error.message || "Could not load packages. Contact support."}</p></div>`;
  },

  renderPackages(packages) {
    const loader = document.getElementById("packageOptionsLoading");
    const target = document.getElementById("packageOptions");
    if (loader) loader.hidden = true;
    if (!target) return;

    if (!packages.length) {
      target.innerHTML = `<div class="hotspot-message-container">No packages are available. Contact support.</div>`;
      return;
    }

    target.innerHTML = packages.map((item, index) => `
      <article class="package-item">
        <span class="package-name">${item.name}</span>
        <span class="package-duration">${item.duration}</span>
        <span class="package-price">${this.money(item.amount)}</span>
        <button class="package-buy-button button-primary" type="button" data-package-index="${index}">
          Buy
        </button>
      </article>
    `).join("");

    target.querySelectorAll("[data-package-index]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectedPackage = packages[Number(button.dataset.packageIndex)];
        this.openPaymentModal();
      });
    });
  },

  bindModal() {
    document.querySelector("[data-close-payment]")?.addEventListener("click", () => this.closePaymentModal());
    document.getElementById("renultPaymentForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.createPayment();
    });
  },

  openPaymentModal() {
    const modal = document.getElementById("renultPaymentModal");
    if (!modal || !this.selectedPackage) return;
    document.getElementById("modalPackageName").textContent = this.selectedPackage.name;
    document.getElementById("modalPackageDuration").textContent = this.selectedPackage.duration;
    document.getElementById("modalPackagePrice").textContent = this.money(this.selectedPackage.amount);
    document.getElementById("paymentMessage").textContent = "";
    document.getElementById("paymentMessage").className = "payment-message";
    modal.hidden = false;
  },

  closePaymentModal() {
    const modal = document.getElementById("renultPaymentModal");
    if (modal) modal.hidden = true;
  },

  setLoading(loading) {
    const button = document.querySelector(".modal-pay-button");
    button?.classList.toggle("button-loading", loading);
    if (button) button.disabled = loading;
  },

  showMessage(message, kind = "") {
    const target = document.getElementById("paymentMessage");
    if (!target) return;
    target.textContent = message;
    target.className = `payment-message ${kind}`.trim();
  },

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  async waitForVoucher(reference) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const response = await fetch(
        `${this.apiBase()}/portal/${encodeURIComponent(this.routerName())}/payments/${encodeURIComponent(reference)}`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.message || "Payment status check failed");
      const voucherCode = payload.voucher?.voucher_code || payload.voucher_code || payload.code;
      if (voucherCode) return voucherCode;
      if (payload.status === "FAILED" || payload.status === "CANCELLED") {
        throw new Error(payload.message || "Payment was not completed");
      }
      this.showMessage(`Waiting for payment confirmation... ${payload.status || "PENDING"}`);
      await this.sleep(5000);
    }
    throw new Error("Payment is still pending. Please use Find Voucher after the prompt completes.");
  },

  async createPayment() {
    if (!this.selectedPackage) return;
    const phone = document.getElementById("paymentPhone").value.trim();
    if (!/^0[0-9]{9}$/.test(phone)) {
      this.showMessage("Enter a valid phone number, for example 07XXXXXXXX.", "error");
      return;
    }

    this.setLoading(true);
    this.showMessage("Sending payment request...");

    try {
      const response = await fetch(`${this.apiBase()}/portal/${encodeURIComponent(this.routerName())}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: phone,
          package_id: this.selectedPackage.raw.id ?? this.selectedPackage.id,
          buy_for: phone,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.message || "Payment failed");
      const reference = payload.reference || payload.payment_reference;
      const voucherCode = payload.voucher?.voucher_code || payload.voucher_code || payload.code || (reference ? await this.waitForVoucher(reference) : "");
      if (!voucherCode) throw new Error("Payment succeeded but no voucher was returned");
      this.applyVoucher(voucherCode);
      this.showMessage(`Voucher ready: ${voucherCode}. Click Connect to go online.`, "success");
    } catch (error) {
      this.showMessage(error.message || "Payment failed. Please try again.", "error");
    } finally {
      this.setLoading(false);
    }
  },

  applyVoucher(voucherCode) {
    const usernameInput = document.getElementById("voucherCode");
    const passwordInput = document.getElementById("loginPassword");
    if (usernameInput) usernameInput.value = voucherCode;
    if (passwordInput) passwordInput.value = voucherCode;
    RenultVoucherStore.save({
      voucherCode,
      packageName: this.selectedPackage.name,
      packageDuration: this.selectedPackage.duration,
      packagePrice: this.money(this.selectedPackage.amount),
    });
  },
};

document.addEventListener("DOMContentLoaded", function () {
  RenultPortal.init();
});
