# Platform Administration

The platform console is available at `/platform-admin`.

Configure at least one bootstrap superadmin in the backend environment:

```env
PLATFORM_ADMIN_EMAILS=admin@example.com
```

Optional integrations:

```env
# Preferred DNS integration
CLOUDFLARE_API_TOKEN=

# Optional DNS fallback
IONOS_API_KEY=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

## Cloudflare DNS token

IONOS and Cloudflare use separate APIs. If the domain's nameservers point to
Cloudflare, no IONOS API key is needed for DNS management.

1. Sign in to the Cloudflare dashboard.
2. Open **My Profile > API Tokens > Create Token**.
3. Start with **Edit zone DNS**, or create a custom token.
4. Grant `Zone / DNS / Edit` and `Zone / Zone / Read`.
5. Restrict **Zone Resources** to the exact zones managed by this platform.
6. Create the token and immediately store the displayed value as
   `CLOUDFLARE_API_TOKEN` in the backend environment.

Verify the token before starting the backend:

```bash
curl https://api.cloudflare.com/client/v4/user/tokens/verify \
  --header "Authorization: Bearer YOUR_TOKEN"
```

The token secret is displayed only once. The Cloudflare R2 access key and
secret are separate credentials and cannot replace this DNS API token.

Implemented areas:

- Global user access, verification, suspension, and sidebar section limits
- Superadmin and permission-scoped subadmin roles
- Voucher, deposit, and withdrawal fee settings
- Voucher code prefix and ordering defaults
- Batch email and SMS broadcasts
- Voucher activation and status audit trail
- Tunnel inventory and router enable/disable controls
- Cloudflare R2 file inventory and deletion
- Cloudflare DNS zone/record creation, proxy selection, inventory, and deletion
- Optional IONOS DNS fallback when Cloudflare is not configured
- Platform health and immutable admin activity audit
- Optional Telegram notification for every platform-admin API access
