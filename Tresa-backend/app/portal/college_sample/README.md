# Renult College Sample Captive Portal

This is a RouterOS hotspot portal sample inspired by the ZenFi college bundle in `app/portal/captive`.

The UI architecture mirrors that sample:
- `login.html` owns the RouterOS hotspot macros, CHAP form, quick voucher login, package container, payment modal, and footer.
- `css/styles.css` defines the same style/class system: `payment-form`, `quick-login-section`, `package-options`, `package-item`, `payment-modal`, loader, notices, and footer blocks.
- `js/core.js` handles voucher/password sync, auto-login URL parameters, and saved voucher recovery.
- `js/renult-pay.js` replaces the ZenFi hosted script and talks to Renult public portal APIs.
- The top-right theme button switches between dark and light mode and remembers the choice on the device.

Files:
- `login.html`: voucher login, free trial link, real Mobile Money package flow.
- `voucher.html`: dedicated existing-voucher connect page with real phone-number lookup.
- `status.html`: connected/session summary.
- `logout.html`: session-ended summary.
- `error.html`: RouterOS error display.
- `rlogin.html`, `redirect.html`, `api.json`: mobile OS captive-network support.
- `portal.css`, `core.js`, `renult-pay.js`, `md5.js`: flat deploy assets used by MikroTik push/deploy.
- `css/` and `js/`: source-style copies kept for local editing/reference.

When pushed through the dashboard, the backend renders these placeholders automatically:

```js
window.RENULT_PORTAL_CONFIG = {
  apiBaseUrl: "__PORTAL_API_BASE__",
  routerName: "__ROUTER_PUBLIC_ID__",
  showPasswordField: false,
  supportPhone: "0700 000 000"
};
```

The package script calls:
- `GET /portal/{routerName}/packages`
- `POST /portal/{routerName}/payments`
- `GET /portal/{routerName}/vouchers/find?phone_number={phone}` from `voucher.html`

Local preview now uses the same Renult API calls as production. Replace the placeholders with a real API base URL and router public name only when previewing the static files directly outside the dashboard push flow.
