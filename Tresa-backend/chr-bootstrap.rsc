# ============================================================
# RENULT BILLING CHR CONCENTRATOR BOOTSTRAP v7
# Platform: Renult / RENULT BILLING
# Run once on the Cloud Hosted Router (CHR).
# Safe to re-run every step is idempotent.
# ============================================================

:local apiPassword   "ac23353c63370ee0e6e323f9e5fb9cd5"
:local ipsecSecret   "k1YFP7xMv02keVk4oTmF558cchIUuasJqJEDK8kSrTBiSS6c"
:local backendHost   "renult.vercel.app"
:local chrPublicIp   "23.92.30.38"
:local chrIdentity   "Tresa-CHR-Concentrator"
:local tunnelSubnet  "10.0.0.0/16"

:put "========================================================"
:put " RENULT BILLING CHR CONCENTRATOR BOOTSTRAP v7"
:put (" Running on: " . $chrPublicIp)
:put "========================================================"

# ============================================================
# STEP 0 RouterOS VERSION GATE
# ============================================================
:put "Step 0: Checking RouterOS version..."
:local fullVersion [/system resource get version]
:local majorStr    [:pick $fullVersion 0 [:find $fullVersion "."]]
:local majorNum    [:tonum $majorStr]
:if ($majorNum < 6) do={
    :put (" FAIL: RouterOS " . $fullVersion . " is too old. Need >= 6.45.")
    :error "RouterOS version check failed"
}
:local minorStart  ([:find $fullVersion "."] + 1)
:local minorStr    [:pick $fullVersion $minorStart ($minorStart + 2)]
:local minorNum    [:tonum $minorStr]
:if (($majorNum = 6) && ($minorNum < 45)) do={
    :put (" FAIL: RouterOS " . $fullVersion . " is too old. Need >= 6.45.")
    :error "RouterOS version check failed"
}
:put (" RouterOS " . $fullVersion . " OK")

# ============================================================
# STEP 1 CHR IDENTITY
# ============================================================
:put "Step 1: Setting CHR identity..."
/system identity set name=$chrIdentity
:put ("Step 1: Done " . $chrIdentity)

# ============================================================
# STEP 2 API USER GROUP AND USER
# ============================================================
:put "Step 2: Creating API user..."
:if ([:len [/user group find where name="tresa-concentrator"]] = 0) do={
    /user group add name=tresa-concentrator policy=api,read,write,policy,test,sensitive
} else={
    /user group set [find where name="tresa-concentrator"] policy=api,read,write,policy,test,sensitive
}
:if ([:len [/user find where name="tresachr"]] = 0) do={
    /user add name=tresachr password=$apiPassword group=tresa-concentrator disabled=no comment="Tresa CHR API - DO NOT DELETE"
} else={
    /user set [find where name="tresachr"] password=$apiPassword group=tresa-concentrator disabled=no comment="Tresa CHR API - DO NOT DELETE"
}
:put "Step 2: Done."

# ============================================================
# STEP 3 TUNNEL IP POOL
# ============================================================
:put "Step 3: Creating tunnel pool..."
:if ([:len [/ip pool find where name="tresa-tunnel-pool"]] = 0) do={
    /ip pool add name=tresa-tunnel-pool ranges=10.0.1.2-10.0.255.254
} else={
    /ip pool set [find where name="tresa-tunnel-pool"] ranges=10.0.1.2-10.0.255.254
}
:put "Step 3: Done."

# ============================================================
# STEP 4 PPP PROFILE
# ============================================================
:put "Step 4: Creating PPP profile..."
:if ([:len [/ppp profile find where name="tresa-l2tp-profile"]] = 0) do={
    /ppp profile add name=tresa-l2tp-profile local-address=10.0.0.1 remote-address=tresa-tunnel-pool only-one=yes change-tcp-mss=yes use-encryption=yes
} else={
    /ppp profile set [find where name="tresa-l2tp-profile"] local-address=10.0.0.1 remote-address=tresa-tunnel-pool only-one=yes change-tcp-mss=yes use-encryption=yes
}
:put "Step 4: Done."

# ============================================================
# STEP 5 L2TP SERVER
# ============================================================
:put "Step 5: Enabling L2TP/IPsec server..."
/interface l2tp-server server set enabled=yes default-profile=tresa-l2tp-profile authentication=mschap2 use-ipsec=yes ipsec-secret=$ipsecSecret max-mtu=1460 max-mru=1460 keepalive-timeout=30
:put "Step 5: Done."

# ============================================================
# STEP 6 API SERVICE ON PORT 51847
# ============================================================
:put "Step 6: Moving API to port 51847..."
/ip service set api disabled=no port=51847 address=0.0.0.0/0
/ip service set api-ssl disabled=yes
/ip service set winbox address=10.0.0.0/16,192.168.88.0/24
:put "Step 6: Done."

# ============================================================
# STEP 7 FIREWALL RULES (idempotent removes Tresa rules then re-adds)
# ============================================================
:put "Step 7: Installing firewall rules..."

:foreach r in=[/ip firewall filter find where comment="Tresa CHR: drop API blacklist"]      do={ /ip firewall filter remove $r }
:foreach r in=[/ip firewall filter find where comment="Tresa CHR: API brute force"]          do={ /ip firewall filter remove $r }
:foreach r in=[/ip firewall filter find where comment="Tresa CHR: allow API"]                do={ /ip firewall filter remove $r }
:foreach r in=[/ip firewall filter find where comment="Tresa CHR: allow IKE NAT-T"]          do={ /ip firewall filter remove $r }
:foreach r in=[/ip firewall filter find where comment="Tresa CHR: allow L2TP IPsec"]         do={ /ip firewall filter remove $r }
:foreach r in=[/ip firewall filter find where comment="Tresa CHR: allow ESP"]                do={ /ip firewall filter remove $r }
:foreach r in=[/ip firewall filter find where comment="Tresa CHR: established input"]        do={ /ip firewall filter remove $r }
:foreach r in=[/ip firewall filter find where comment="Tresa CHR: established forward"]      do={ /ip firewall filter remove $r }
:foreach r in=[/ip firewall filter find where comment="Tresa CHR: allow router API dstnat"]  do={ /ip firewall filter remove $r }

/ip firewall filter add chain=input  action=accept connection-state=established,related  comment="Tresa CHR: established input"
/ip firewall filter add chain=input  action=accept protocol=udp dst-port=500,4500          comment="Tresa CHR: allow IKE NAT-T"
/ip firewall filter add chain=input  action=accept protocol=udp dst-port=1701 ipsec-policy=in,ipsec comment="Tresa CHR: allow L2TP IPsec"
/ip firewall filter add chain=input  action=accept protocol=ipsec-esp                      comment="Tresa CHR: allow ESP"
/ip firewall filter add chain=input  action=accept protocol=tcp dst-port=51847             comment="Tresa CHR: allow API"
/ip firewall filter add chain=input  action=add-src-to-address-list protocol=tcp dst-port=51847 connection-state=new connection-limit=6,32 address-list=tresa_api_blacklist address-list-timeout=1d comment="Tresa CHR: API brute force"
/ip firewall filter add chain=input  action=drop src-address-list=tresa_api_blacklist       comment="Tresa CHR: drop API blacklist"
/ip firewall filter add chain=forward action=accept connection-state=established,related   comment="Tresa CHR: established forward"
/ip firewall filter add chain=forward action=accept protocol=tcp dst-port=8728 connection-nat-state=dstnat comment="Tresa CHR: allow router API dstnat"

# Move Tresa rules ahead of any pre-existing blanket drop reverse desired order.
# Wrapped in on-error: RouterOS rejects "move X 0" with "can not move object
# before itself" once X is already first, which is harmless on rerun.
:do { /ip firewall filter move [find where comment="Tresa CHR: allow router API dstnat"]  0 } on-error={}
:do { /ip firewall filter move [find where comment="Tresa CHR: established forward"]       0 } on-error={}
:do { /ip firewall filter move [find where comment="Tresa CHR: drop API blacklist"]        0 } on-error={}
:do { /ip firewall filter move [find where comment="Tresa CHR: API brute force"]           0 } on-error={}
:do { /ip firewall filter move [find where comment="Tresa CHR: allow API"]                 0 } on-error={}
:do { /ip firewall filter move [find where comment="Tresa CHR: allow ESP"]                 0 } on-error={}
:do { /ip firewall filter move [find where comment="Tresa CHR: allow L2TP IPsec"]          0 } on-error={}
:do { /ip firewall filter move [find where comment="Tresa CHR: allow IKE NAT-T"]           0 } on-error={}
:do { /ip firewall filter move [find where comment="Tresa CHR: established input"]         0 } on-error={}

:put "Step 7: Done."

# ============================================================
# STEP 7B NAT MASQUERADE FOR TUNNEL-BOUND TRAFFIC
# Without this, forwarded API/SNMP connections (CHR -> customer
# router) reach the customer router with the original internet
# source address. That fails the customer router's
# "/ip service api address=10.0.0.0/16,..." restriction and the
# reply would route back out the customer's WAN instead of the
# tunnel. Masquerading rewrites the source to CHR's tunnel address
# (10.0.0.1) so the connection is accepted and replies route back
# through the tunnel to CHR (then un-NAT'd back to the caller).
# ============================================================
:put "Step 7b: Configuring NAT masquerade for tunnel-bound traffic..."
:foreach r in=[/ip firewall nat find where comment="Tresa CHR: masquerade tunnel-bound traffic"] do={ /ip firewall nat remove $r }
/ip firewall nat add chain=srcnat action=masquerade dst-address=$tunnelSubnet comment="Tresa CHR: masquerade tunnel-bound traffic"
:put "Step 7b: Done."

# ============================================================
# STEP 8 CONNECTIVITY SELF-TEST (backend reachability)
# ============================================================
:put "Step 8: Testing connectivity to Renult backend..."
:local backendOk false
:do {
    :local result [/tool fetch url=("https://" . $backendHost . "/health") output=user as-value]
    :if (($result->"status") = "finished") do={
        :set backendOk true
    }
} on-error={
    :set backendOk false
}
:if ($backendOk = true) do={
    :put "Step 8: Backend reachable OK."
} else={
    :put ("Step 8: WARNING Could not reach " . $backendHost . ". Check CHR internet and DNS.")
    :put "         The CHR is configured correctly. Verify manually if needed."
}

# ============================================================
# STEP 9 VERIFY ALL REQUIRED COMPONENTS
# ============================================================
:put "Step 9: Verifying CHR configuration..."
:local verifyFailed false

:put ("  RouterOS version  : " . $fullVersion)

:local apiUserId [/user find where name="tresachr"]
:if ([:len $apiUserId] = 0) do={
    :put "  VERIFY FAILED: API user tresachr is missing."
    :set verifyFailed true
} else={
    :if ([/user get $apiUserId disabled] = true) do={
        :put "  VERIFY FAILED: API user tresachr is disabled."
        :set verifyFailed true
    } else={
        :put "  API user tresachr : OK"
    }
}

:if ([:len [/ip pool find where name="tresa-tunnel-pool"]] = 0) do={
    :put "  VERIFY FAILED: tunnel pool is missing."
    :set verifyFailed true
} else={
    :put "  Tunnel pool       : OK (10.0.1.2 - 10.0.255.254)"
}

:if ([:len [/ppp profile find where name="tresa-l2tp-profile"]] = 0) do={
    :put "  VERIFY FAILED: PPP profile is missing."
    :set verifyFailed true
} else={
    :put "  PPP profile       : OK"
}

:if ([/interface l2tp-server server get enabled] != true) do={
    :put "  VERIFY FAILED: L2TP server is disabled."
    :set verifyFailed true
} else={
    :put "  L2TP/IPsec server : ENABLED"
}

:if ([/ip service get api disabled] = true) do={
    :put "  VERIFY FAILED: API service is disabled."
    :set verifyFailed true
} else={
    :if ([/ip service get api port] != 51847) do={
        :put "  VERIFY FAILED: API service is not on port 51847."
        :set verifyFailed true
    } else={
        :put "  API service       : OK (port 51847)"
    }
}

:if ([:len [/ip firewall filter find where comment="Tresa CHR: allow API"]] = 0) do={
    :put "  VERIFY FAILED: API firewall rule is missing."
    :set verifyFailed true
} else={
    :put "  Firewall rules    : OK"
}

:if ([:len [/ip firewall nat find where comment="Tresa CHR: masquerade tunnel-bound traffic"]] = 0) do={
    :put "  VERIFY FAILED: tunnel masquerade NAT rule is missing."
    :set verifyFailed true
} else={
    :put "  Tunnel masquerade : OK"
}

:if ($verifyFailed = true) do={
    :error "Tresa CHR verification failed review errors above and re-run."
}

:put "Step 9: All checks passed."

:put "========================================================"
:put " RENULT BILLING CHR CONCENTRATOR READY"
:put (" Public IP         : " . $chrPublicIp)
:put (" Backend URL       : https://" . $backendHost)
:local reachableStr "no (check internet/DNS)"
:if ($backendOk = true) do={ :set reachableStr "yes" }
:put (" Backend reachable : " . $reachableStr)
:put " API port (CHR)    : 51847"
:put " Tunnel subnet     : 10.0.0.0/16"
:put " L2TP security     : IPsec + MSCHAPv2"
:put " API user          : tresachr"
:put "--------------------------------------------------------"
:put " NEXT: Open the Renult dashboard, go to Configure &"
:put " Provision Router, enter a name, and click"
:put " 'Generate Registration Script'. Give the customer"
:put " the single-line command shown no further CHR"
:put " changes needed."
:put "========================================================"
