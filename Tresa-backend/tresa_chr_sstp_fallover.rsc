# ============================================================
# RENULT BILLING CHR CONCENTRATOR SSTP FALLOVER ADDON v1
# Platform: Renult / RENULT BILLING
# Run AFTER chr-bootstrap.rsc v7 has completed successfully.
# Safe to re-run every step is idempotent.
#
# Adds SSTP (TCP/443) as a fallover transport for customer
# routers whose ISP blocks the UDP ports L2TP/IPsec needs
# (500, 4500, 1701, ESP). Reuses the same PPP profile and
# tunnel pool as L2TP a router connects via one or the
# other, never both.
#
# Does NOT touch L2TP, the API service, the established/API
# firewall rules, or NAT masquerade those are left exactly
# as chr-bootstrap.rsc configured them.
# ============================================================

:local chrPublicIp "23.92.30.38"
# ^ keep this in sync with chr-bootstrap.rsc's $chrPublicIp used only
#   as the SSTP server certificate's common-name (not validated by
#   clients, since verify-server-certificate=no).

:put "========================================================"
:put " RENULT BILLING CHR SSTP FALLOVER ADDON v1"
:put (" Running on: " . $chrPublicIp)
:put "========================================================"

# ============================================================
# STEP 1 PRECHECK: chr-bootstrap.rsc must already be applied
# ============================================================
:put "Step 1: Checking that chr-bootstrap.rsc v7 has been applied..."
:if ([:len [/ppp profile find where name="tresa-l2tp-profile"]] = 0) do={
    :put " FAIL: tresa-l2tp-profile not found."
    :put " Run chr-bootstrap.rsc v7 on this CHR first, then re-run this addon."
    :error "chr-bootstrap.rsc has not been applied to this CHR"
}
:if ([/interface l2tp-server server get enabled] != true) do={
    :put " FAIL: L2TP/IPsec server is not enabled."
    :put " Run chr-bootstrap.rsc v7 on this CHR first, then re-run this addon."
    :error "chr-bootstrap.rsc has not been applied to this CHR"
}
:put "Step 1: OK base CHR configuration found."

# ============================================================
# STEP 2 SSTP CERTIFICATES (idempotent)
# ============================================================
:put "Step 2: Setting up SSTP certificates..."

:if ([:len [/certificate find where name="tresa-sstp-ca"]] = 0) do={
    :put "  Creating SSTP CA certificate..."
    /certificate add name=tresa-sstp-ca common-name=tresa-sstp-ca \
        key-usage=key-cert-sign,crl-sign
    /certificate sign tresa-sstp-ca
    :put "  CA certificate signed."
} else={
    :put "  SSTP CA certificate already exists skipping."
}

:if ([:len [/certificate find where name="tresa-sstp-server"]] = 0) do={
    :put "  Creating SSTP server certificate..."
    /certificate add name=tresa-sstp-server common-name=$chrPublicIp
    /certificate sign tresa-sstp-server ca=tresa-sstp-ca
    :put "  Server certificate signed."
} else={
    :put "  SSTP server certificate already exists skipping."
}
:put "Step 2: Done."

# ============================================================
# STEP 3 SSTP SERVER (reuses tresa-l2tp-profile + tunnel pool)
# ============================================================
:put "Step 3: Enabling SSTP server..."

/interface sstp-server server set \
    enabled=yes \
    certificate=tresa-sstp-server \
    authentication=mschap2 \
    verify-client-certificate=no \
    default-profile=tresa-l2tp-profile \
    pfs=no

# tls-version was added in RouterOS v7 and does not exist on v6.45-6.x
# apply it as a best-effort second step so the rest of this script still
# works (and stays idempotent) on either major version.
:do {
    /interface sstp-server server set tls-version=any
} on-error={
    :put "  (tls-version not supported on this RouterOS version skipping)"
}

:put "Step 3: Done SSTP server enabled on port 443."

# ============================================================
# STEP 4 FIREWALL: allow SSTP (TCP/443)
# ============================================================
:put "Step 4: Installing SSTP firewall rule..."

:foreach r in=[/ip firewall filter find where comment="Tresa CHR: allow SSTP"] do={
    /ip firewall filter remove $r
}
/ip firewall filter add \
    chain=input \
    protocol=tcp \
    dst-port=443 \
    action=accept \
    comment="Tresa CHR: allow SSTP"
:do { /ip firewall filter move [find where comment="Tresa CHR: allow SSTP"] 0 } on-error={}

:put "Step 4: Done."
# Note: forwarded API/SNMP connections (CHR -> customer router) over the
# SSTP tunnel are already covered by chr-bootstrap.rsc's
# "Tresa CHR: allow router API dstnat" forward rule from Step 7 that
# rule matches on protocol/port/dstnat state only, not the tunnel
# interface, so no separate SSTP forward rule is needed.

# ============================================================
# STEP 5 VERIFY
# ============================================================
:put "Step 5: Verifying SSTP fallover configuration..."
:local verifyFailed false

:if ([/interface sstp-server server get enabled] != true) do={
    :put "  VERIFY FAILED: SSTP server is disabled."
    :set verifyFailed true
} else={
    :put "  SSTP server       : ENABLED (port 443 L2TP fallover)"
}

:if ([:len [/certificate find where name="tresa-sstp-server"]] = 0) do={
    :put "  VERIFY FAILED: SSTP server certificate missing."
    :set verifyFailed true
} else={
    :put "  SSTP certificate  : OK"
}

:if ([:len [/ip firewall filter find where comment="Tresa CHR: allow SSTP"]] = 0) do={
    :put "  VERIFY FAILED: SSTP firewall rule missing."
    :set verifyFailed true
} else={
    :put "  SSTP firewall     : OK"
}

:if ($verifyFailed = true) do={
    :error "Tresa CHR SSTP fallover verification failed review errors above and re-run."
}

:put "========================================================"
:put " RENULT BILLING CHR SSTP FALLOVER READY"
:put (" Public IP         : " . $chrPublicIp)
:put " SSTP port (CHR)   : 443 (TCP)"
:put " Fallover profile  : tresa-l2tp-profile (shared with L2TP)"
:put "--------------------------------------------------------"
:put " NEXT: Provision customer routers with an SSTP client"
:put " fallover (see the reference block at the bottom of this"
:put " file) so they switch to SSTP when L2TP/IPsec can't"
:put " connect (e.g. ISP blocks UDP 500/4500/1701 or ESP)."
:put "========================================================"

# ============================================================
# CUSTOMER ROUTER REFERENCE SSTP FALLOVER CLIENT (for provisioning)
#
# This block is NOT executed by this addon. It documents the
# client-side companion to the SSTP server above, matching the
# variable names and "tresa-tunnel" interface naming used by the
# real registration script (build_secure_setup_script in
# app/services/routers/security.py): $chrHost, $pppUser, $pppPass.
#
# IMPORTANT firewall caveat if you wire this up in security.py:
# the registration script's firewall rules restrict CHR API/SNMP
# access with in-interface="tresa-tunnel" (allow) and
# in-interface=!tresa-tunnel (blacklist/brute-force). When SSTP
# fallover is active, traffic arrives on "tresa-tunnel-sstp"
# instead, so those rules would need to also match
# "tresa-tunnel-sstp" (e.g. via an interface-list containing both
# interfaces) or CHR access over the SSTP fallover would be
# blacklisted/dropped.
# ============================================================

# :foreach oldTunnel in=[/interface sstp-client find where name="tresa-tunnel-sstp"] do={
#     /interface sstp-client remove $oldTunnel
# }
# /interface sstp-client add \
#     name="tresa-tunnel-sstp" \
#     connect-to=$chrHost \
#     user=$pppUser \
#     password=$pppPass \
#     authentication=mschap2 \
#     verify-server-certificate=no \
#     add-default-route=no \
#     disabled=yes \
#     comment="Tresa Bill SSTP Fallover - DO NOT DELETE"
#
# FALLOVER LOGIC: every 60s, if the L2TP tunnel (tresa-tunnel) is not
# running, enable the SSTP client; if L2TP is running again, disable
# the SSTP client. Only one connects at a time.
#
# :foreach oldSchedule in=[/system scheduler find where name="TresaSstpFallover"] do={
#     /system scheduler remove $oldSchedule
# }
# /system scheduler add \
#     name="TresaSstpFallover" \
#     interval=60s \
#     on-event={
#         :local l2tpId [/interface l2tp-client find where name="tresa-tunnel"]
#         :local sstpId [/interface sstp-client find where name="tresa-tunnel-sstp"]
#         :if (([:len $l2tpId] > 0) && ([:len $sstpId] > 0)) do={
#             :local l2tpUp [/interface l2tp-client get $l2tpId running]
#             :local sstpDisabled [/interface sstp-client get $sstpId disabled]
#             :if ($l2tpUp = true) do={
#                 :if ($sstpDisabled = false) do={
#                     /interface sstp-client disable $sstpId
#                     :log info "Tresa: L2TP up - disabled SSTP fallover"
#                 }
#             } else={
#                 :if ($sstpDisabled = true) do={
#                     /interface sstp-client enable $sstpId
#                     :log warning "Tresa: L2TP down - enabled SSTP fallover"
#                 }
#             }
#         }
#     } \
#     comment="Tresa Bill: SSTP fallover watchdog"
