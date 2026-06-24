# Renult College Sample Captive Portal

This is a RouterOS hotspot portal sample inspired by the ZenFi college bundle in `app/portal/captive`.

The UI architecture mirrors that sample:
- `login.html` owns the RouterOS hotspot macros, CHAP form, quick voucher login, package container, payment modal, and footer.
- `css/styles.css` defines the same style/class system: `payment-form`, `quick-login-section`, `package-options`, `package-item`, `payment-modal`, loader, notices, and footer blocks.
- `js/core.js` handles voucher/password sync, auto-login URL parameters, and saved voucher recovery.
- `js/renult-pay.js` replaces the ZenFi hosted script and talks to Renult public portal APIs.
- The top-right theme button switches between dark and light mode and remembers the choice on the device.

Files:
- `login.html`: voucher login, free trial link, demo Mobile Money package flow.
- `voucher.html`: dedicated existing-voucher connect page with real phone-number lookup.
- `status.html`: connected/session summary.
- `logout.html`: session-ended summary.
- `error.html`: RouterOS error display.
- `rlogin.html`, `redirect.html`, `api.json`: mobile OS captive-network support.
- `css/styles.css`, `js/core.js`, `js/renult-pay.js`, `js/md5.js`: local assets for offline hotspot use.

To use real Renult API data, edit `window.RENULT_PORTAL_CONFIG` in `login.html`:

```js
window.RENULT_PORTAL_CONFIG = {
  apiBaseUrl: "https://api.renult.xyz",
  routerName: "your-router-public-name",
  showPasswordField: false,
  supportPhone: "0700 000 000"
};
```

The package script calls:
- `GET /portal/{routerName}/packages`
- `POST /portal/{routerName}/payments`
- `GET /portal/{routerName}/vouchers/find?phone_number={phone}` from `voucher.html`

Local preview now uses the same Renult API calls as production. Set `routerName` to a real router public name before testing package loads, payments, or voucher lookup.
