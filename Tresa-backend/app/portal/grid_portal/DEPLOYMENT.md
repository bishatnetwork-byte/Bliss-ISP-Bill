# Renault WIFI MikroTik Deployment

## Portal files

Upload the contents of this folder to the MikroTik hotspot HTML directory. Keep
`login.html`, `md5.js`, `errors.txt`, `alogin.html`, `status.html`,
`logout.html`, `error.html`, `rlogin.html`, `redirect.html`, and `portal.css`
together.

`index.html` is retained for normal browser previews. RouterOS uses
`login.html`.

## Router ID

The portal currently sends this backend router identifier:

```text
NEW MIKROTIK ROUTER
```

It is configured as `ROUTER_ID` in `login.html` and `index.html`. The same ID
must exist in the Renault billing backend.

## Walled garden

"Push to MikroTik" and "Deploy via R2" automatically add the walled-garden
entries needed for the voucher/payment flow (see
`_walled_garden_hosts_for_template` in `app/services/portal.py`):

```routeros
/ip hotspot walled-garden
add action=allow dst-host=vercel.app
add action=allow dst-host=*.vercel.app
add action=allow dst-host=mtn.co.ug
add action=allow dst-host=*.mtn.co.ug
add action=allow dst-host=mtn.com
add action=allow dst-host=*.mtn.com
add action=allow dst-host=airtel.co.ug
add action=allow dst-host=*.airtel.co.ug
add action=allow dst-host=airtel.africa
add action=allow dst-host=*.airtel.africa
```

- `vercel.app` / `*.vercel.app` covers both the backend API
  (`renult.vercel.app`) and the Renult Pay gateway
  (`renult-pay.vercel.app`) — both are Vercel-hosted, so this single
  wildcard keeps working even if either project's domain changes.
- The `mtn.*` / `airtel.*` entries allow MTN and Airtel mobile money
  payment-confirmation pages to load in the customer's browser before
  they've authenticated on the hotspot.

These entries are added automatically on every deploy (existing entries are
left untouched, no duplicates are created). If the router uses a strict DNS
or firewall policy, also ensure hotspot clients can resolve DNS and make
HTTPS connections to these hosts.

### Self-healing: `TresaWalledGardenSync` script + scheduler

Every deploy also creates (or updates) a `/system script` and
`/system scheduler` entry named **`TresaWalledGardenSync`** on the router.
It runs once on `startup` and then every `00:10:00`, re-adding any of the
walled-garden entries above if they're ever missing — e.g. if
`/ip hotspot setup` is re-run and clears the walled-garden list. It's named
distinctly from this router's other schedulers (`RunHeartbeat`,
`RunHeartbeatCleanup`, `RunChrPingFailover`, `FixDNSonBoot`, ...) so it won't
collide or get confused with them.

## Hotspot profile

Point the hotspot profile at the directory containing these files. For a
standard `hotspot` directory and profile named `hsprof1`:

```routeros
/ip hotspot profile set [find name="hsprof1"] html-directory=hotspot
```

The portal supports both voucher authentication styles used by the Luco
portal: an empty password first, then the voucher code as both username and
password if RouterOS rejects the first attempt.

## Troubleshooting: edits to `login.html` don't appear after redeploy

The "Push to MikroTik" and "Deploy via R2" actions do **not** read your local
copy of this file. They read `app/portal/renault/login.html` from the
**Tresa-backend server's own deployed filesystem** (see `PORTAL_ROOT` in
`app/services/portal.py`), render it (substituting `__PORTAL_API_BASE__`,
`__ROUTER_PUBLIC_ID__`, `__ROUTER_NAME__`), and push that rendered copy to the
router.

So if you edit `login.html` locally and immediately click "Push to MikroTik"
or "Deploy via R2", the router will receive the **old** template that's still
running on the backend — your edits won't show up.

To make edits to `login.html` (or any other portal file) take effect:

1. Commit/push your changes.
2. Redeploy the Tresa-backend service itself (e.g. trigger a new Vercel/host
   deployment) so the server's filesystem has the updated `login.html`.
3. Only then click "Push to MikroTik" or "Deploy via R2" from the dashboard —
   this re-renders the new template and pushes/fetches it onto the router.

If step 3 is done before step 2, the router will be re-flashed with the same
old content, which looks like "my edit didn't work".
