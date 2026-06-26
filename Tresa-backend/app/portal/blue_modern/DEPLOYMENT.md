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

Allow the Renault payment and voucher API before authentication:

```routeros
/ip hotspot walled-garden add dst-host=api.bliss-isp.com
```

If the router uses a strict DNS or firewall policy, also ensure hotspot clients
can resolve DNS and make HTTPS connections to `api.bliss-isp.com`.

## Hotspot profile

Point the hotspot profile at the directory containing these files. For a
standard `hotspot` directory and profile named `hsprof1`:

```routeros
/ip hotspot profile set [find name="hsprof1"] html-directory=hotspot
```

The portal supports both voucher authentication styles used by the Luco
portal: an empty password first, then the voucher code as both username and
password if RouterOS rejects the first attempt.
