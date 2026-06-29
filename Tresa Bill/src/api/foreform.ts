/* eslint-disable @typescript-eslint/no-explicit-any */
const configuredApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || "https://api.bliss-isp.com";
const API_BASE_URL = configuredApiUrl.replace(/^http:\/\/renult\.vercel\.app/i, "https://api.bliss-isp.com").replace(/\/$/, "");
const LUCOPAY_API_BASE_URL = "https://lucopay-backend.vercel.app";
const AUTH_TOKEN_KEY = "renult:auth-token";
const AUTH_USER_KEY = "renult:auth-user";
const ACCOUNT_BASE_DOMAIN = import.meta.env.VITE_ACCOUNT_BASE_DOMAIN || "renult.xyz";

export function getAccountBaseDomain() {
  return ACCOUNT_BASE_DOMAIN;
}

export function getAccountSubdomainUrl(
  subdomain: string,
  handoffCode: string,
  path = "/",
) {
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const protocol = isLocal ? window.location.protocol : "https:";
  const port = isLocal && window.location.port ? `:${window.location.port}` : "";
  const host = isLocal
    ? window.location.hostname
    : `${subdomain}.${ACCOUNT_BASE_DOMAIN}`;
  const targetPath = path.startsWith("/") ? path : "/";
  const params = new URLSearchParams({ code: handoffCode, next: targetPath });
  return `${protocol}//${host}${port}/auth/subdomain#${params.toString()}`;
}

export async function redirectToAccountSubdomain(auth: AuthResponse, path = "/") {
  if (!auth.user.subdomain_enabled || !auth.user.account_subdomain) return false;
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) return false;
  const handoff = await apiRequest<{ code: string; subdomain: string; expires_in: number }>(
    "/auth/subdomain-handoff",
    { method: "POST" },
  );
  const targetUrl = getAccountSubdomainUrl(
    handoff.subdomain,
    handoff.code,
    path,
  );
  if (window.location.hostname === new URL(targetUrl).hostname) return false;
  const targetOrigin = new URL(targetUrl).origin;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(targetOrigin, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    console.warn(`Account subdomain is not reachable yet: ${targetOrigin}`);
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
  window.location.assign(targetUrl);
  return true;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  is_verified: boolean;
  avatar_url: string | null;
  auth_provider: string;
  account_type: "owner" | "staff";
  is_active: boolean;
  allowed_sections: string[];
  platform_role: "superadmin" | "subadmin" | null;
  platform_permissions: string[];
  account_subdomain: string | null;
  subdomain_enabled: boolean;
  staff_branch_id: string | null;
  staff_role: string | null;
  staff_permissions: string[];
  share_percentage: number;
  force_password_change: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type?: string;
  user: UserResponse;
}

export type UserProfileUpdate = {
  full_name?: string;
  phone_number?: string | null;
};

export interface LoginActivityResponse {
  id: string;
  email: string;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface SubscriptionResponse {
  id: string;
  user_id: string;
  name: string;
  provider: string | null;
  category: string;
  amount: number;
  currency: string;
  due_date: string;
  alert_days_before: number;
  notify_in_app: boolean;
  notify_email: boolean;
  notify_sms: boolean;
  sms_phone: string | null;
  notes: string | null;
  is_active: boolean;
  days_until_due: number;
  reminder_due: boolean;
  last_notified_on: string | null;
  created_at: string;
  updated_at: string;
}

export type SubscriptionPayload = {
  name: string;
  provider?: string | null;
  category: string;
  amount: number;
  currency: string;
  due_date: string;
  alert_days_before: number;
  notify_in_app: boolean;
  notify_email: boolean;
  notify_sms: boolean;
  sms_phone?: string | null;
  notes?: string | null;
  is_active: boolean;
};

export interface PlatformOverviewResponse {
  users: number;
  active_users: number;
  branches: number;
  routers: number;
  tunnels_online: number;
  tunnels_offline: number;
  vouchers: number;
  activated_vouchers: number;
  expired_vouchers: number;
  wallet_balance: number;
  platform_fees: number;
  my_platform_fee_share_percentage: number;
  my_platform_fee_share_amount: number;
  assigned_platform_fee_share_percentage: number;
  unassigned_platform_fee_share_percentage: number;
  r2_configured: boolean;
  dns_configured: boolean;
  dns_provider: "cloudflare" | "ionos" | "unconfigured";
  telegram_admins: number;
}

export interface PlatformUserResponse {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  is_verified: boolean;
  is_active: boolean;
  allowed_sections: string[];
  platform_role: "superadmin" | "subadmin" | null;
  platform_permissions: string[];
  platform_fee_share_percentage: number;
  platform_fee_share_amount: number;
  account_subdomain: string | null;
  subdomain_enabled: boolean;
  branches: number;
  routers: number;
  vouchers: number;
  wallet_balance: number;
  created_at: string;
  blocked_until: string | null;
  force_password_change: boolean;
}

export type PlatformUserUpdate = Partial<Pick<PlatformUserResponse,
  "email" | "full_name" | "phone_number" | "is_active" | "is_verified" |
  "allowed_sections" | "account_subdomain" | "subdomain_enabled"
>>;

export interface PlatformSettingsResponse {
  voucher_fee_type: "fixed" | "percentage";
  voucher_fee_value: number;
  deposit_fee_type: "fixed" | "percentage";
  deposit_fee_percentage: number;
  deposit_fee_fixed_amount: number;
  withdrawal_fee_type: "fixed" | "percentage";
  withdrawal_fee_percentage: number;
  withdrawal_fee_fixed_amount: number;
  withdrawal_min_amount: number;
  withdrawal_max_amount: number;
  voucher_prefix: string;
  voucher_prefix_order: "prefix-first" | "prefix-last";
  telegram_access_alerts: boolean;
}

export interface PlatformLoginAttemptResponse {
  id: string;
  email: string;
  user_id: string | null;
  user_name: string | null;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface PlatformSessionResponse {
  id: string;
  user_id: string;
  user_name: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface PlatformNotificationResponse {
  id: string;
  user_id: string;
  user_name: string;
  category: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface PlatformWalletResponse {
  id: string;
  user_id: string;
  owner_name: string;
  branch_id: string;
  branch_name: string;
  balance: number;
  total_deposited: number;
  total_withdrawn: number;
  total_fees_paid: number;
  is_frozen: boolean;
  updated_at: string;
}

export interface PlatformTunnelResponse {
  id: string;
  router_name: string;
  owner_name: string;
  branch_name: string;
  is_active: boolean;
  status: string;
  heartbeat_status: string;
  snmp_status: string;
  tunnel_ip: string | null;
  ppp_username: string | null;
  nat_port: number | null;
  winbox_nat_port: number | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_seen: string | null;
}

export interface PlatformRouterResponse {
  id: string;
  branch_id: string;
  branch_name: string;
  owner_id: string;
  owner_name: string;
  name: string;
  host: string;
  port: number;
  username: string;
  location: string | null;
  description: string | null;
  is_active: boolean;
  status: string;
  heartbeat_status: string;
  snmp_status: string;
  tunnel_ip: string | null;
  ppp_username: string | null;
  nat_port: number | null;
  winbox_nat_port: number | null;
  hotspot_provisioned: boolean;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export type PlatformRouterUpdate = Partial<Pick<PlatformRouterResponse, "name" | "location" | "description" | "is_active">>;

export interface PlatformRouterCommandRequest {
  router_ids: string[];
  command: "ping" | "reboot" | "script" | "scheduler";
  target?: string | null;
  script_name?: string | null;
  script_source?: string | null;
  run_now?: boolean;
  scheduler_name?: string | null;
  scheduler_interval?: string | null;
  scheduler_start_time?: string;
  scheduler_on_event?: string | null;
}

export interface PlatformRouterCommandResponse {
  command: string;
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    router_id: string;
    router_name: string;
    success: boolean;
    message: string;
    error: string | null;
  }>;
}

export interface PlatformVoucherAuditResponse {
  id: string;
  voucher_code: string;
  router_name: string;
  event: string;
  previous_status: string | null;
  new_status: string;
  activated_at: string | null;
  expires_at: string | null;
  metadata: unknown;
  created_at: string;
}

export interface PlatformMessageDiagnosticResponse {
  id: string;
  branch_id: string;
  branch_name: string;
  user_id: string;
  user_name: string;
  message: string;
  message_type: "custom" | "voucher";
  recipients: string[];
  status: "sending" | "completed" | "partial" | "failed";
  sent: number;
  failed: number;
  results: MessageSendResult[];
  error: string | null;
  cost_per_sms: number;
  total_charged: number;
  wallet_balance: number;
  created_at: string;
  updated_at: string;
}

export interface SmsGatewayResponse {
  id: "africastalking" | "julysms" | string;
  label: string;
  enabled: boolean;
  is_default: boolean;
  is_configured: boolean;
  credentials_source: "dashboard" | "env" | "missing" | string;
  sender_id: string | null;
  supports_balance: boolean;
}

export interface SmsGatewayUpdatePayload {
  enabled: boolean;
  username?: string;
  api_key?: string;
  sender_id?: string;
  client_id?: string;
  client_secret?: string;
}

export interface SmsGatewayBalanceResponse {
  provider: string;
  balance: unknown;
  raw: unknown;
}

export interface PlatformUserDetailResponse {
  user: PlatformUserResponse;
  branches: Array<{
    id: string;
    name: string;
    avatar_url: string;
    routers: number;
    vouchers: number;
    wallet_balance: number;
    wallet_frozen: boolean;
    created_at: string;
  }>;
  routers: Array<{
    id: string;
    branch_id: string;
    branch_name: string;
    name: string;
    location: string | null;
    is_active: boolean;
    status: string;
    last_seen: string | null;
    created_at: string;
  }>;
  recent_vouchers: Array<{
    id: string;
    voucher_code: string;
    router_name: string;
    phone_number: string;
    profile: string;
    amount: number;
    status: string;
    created_at: string;
    activated_at: string | null;
    expires_at: string | null;
  }>;
}

export interface PlatformAuditResponse {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: unknown;
  created_at: string;
}

export interface PlatformStorageObjectResponse {
  key: string;
  size: number;
  last_modified: string | null;
  etag: string | null;
  url: string;
}

export interface PlatformDnsZoneResponse {
  id: string;
  type: string | null;
  name: string;
  provider: "cloudflare" | "ionos";
}

export interface PlatformDnsRecordResponse {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  disabled: boolean;
  proxied: boolean | null;
}

export interface PlatformHealthResponse {
  status: string;
  database: string;
  concentrator_enabled: boolean;
  snmp_monitor_enabled: boolean;
  r2: string;
  dns: string;
  dns_provider: "cloudflare" | "ionos" | "unconfigured";
  email: string;
  sms: string;
  payment_gateway: string;
  router_errors_24h: number;
  last_router_error: string | null;
  router_error_logs?: Array<{
    id: string;
    router_id: string | null;
    operation: string;
    message: string;
    created_at: string;
  }>;
}

export interface BranchResponse {
  id: string;
  name: string;
  avatar_url: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface StaffResponse {
  id: string;
  branch_id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  role: string;
  permissions: string[];
  share_percentage: number;
  is_active: boolean;
  user_id: string | null;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

export interface RevenueShareResponse {
  branch_id: string;
  gross_sales: number;
  allocated_percentage: number;
  owner_percentage: number;
  owner_amount: number;
  current_user_percentage: number;
  current_user_amount: number;
  agents: Array<{ staff_id: string; full_name: string; percentage: number; amount: number }>;
}

export interface NotificationResponse {
  id: string;
  category: string;
  title: string;
  body: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: NotificationResponse[];
  unread_count: number;
  total: number;
}

export interface NotificationPreferenceResponse {
  email_router_alerts: boolean;
  sms_router_alerts: boolean;
  sms_phone_number: string | null;
  sms_cost_ugx: number;
}

export interface TelegramConnectionResponse {
  connected: boolean;
  bot_username: string | null;
  chat_id: string | null;
  chat_title: string | null;
  secondary_chat_id: string | null;
  secondary_chat_title: string | null;
  voucher_purchases: boolean;
  voucher_batches: boolean;
  withdrawal_receipts: boolean;
  router_alerts: boolean;
  hourly_router_ping: boolean;
}

export type TelegramPreferenceUpdate = Pick<
  TelegramConnectionResponse,
  "voucher_purchases" | "voucher_batches" | "withdrawal_receipts" | "router_alerts" | "hourly_router_ping"
>;

export interface RouterMonitorItem {
  router_id: string;
  router_name: string;
  status: "online" | "offline" | "unknown";
  configured: boolean;
  checked_at: string | null;
  uptime_seconds: number | null;
  error: string | null;
}

export interface RouterMonitorSummary {
  status: "online" | "offline" | "unknown";
  online: number;
  offline: number;
  unknown: number;
  total: number;
  last_checked_at: string | null;
  routers: RouterMonitorItem[];
}

export interface SnmpEnableResponse {
  success: boolean;
  router_id: string;
  router_name: string;
  physical_router_enabled: boolean;
  chr_forwarding_enabled: boolean;
  verified: boolean;
  uptime_seconds: number | null;
  message: string;
}

export interface UploadResponse {
  key: string;
  filename: string;
  content_type: string | null;
  size: number;
  url: string;
}

export interface TicketCategoryResponse {
  id: string;
  name: string;
  description: string | null;
}

export interface TicketResponse {
  id: string;
  branch_id: string;
  category_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_staff_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Router Interfaces ──────────────────────────────────────────
export interface RouterResponse {
  id: string;
  branch_id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  plaintext_login: boolean;
  location: string | null;
  description: string | null;
  is_active: boolean;
  ppp_username: string | null;
  tunnel_ip: string | null;
  nat_port: number | null;
  trial_enabled: boolean;
  trial_minutes: number;
  status: string;
  hotspot_provisioned: boolean;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouterTrialUpdate {
  trial_enabled: boolean;
  trial_minutes: number;
}

export interface RouterTrialResponse {
  success: boolean;
  router_id: string;
  router_name: string;
  trial_enabled: boolean;
  trial_minutes: number;
  router_sync_error: string | null;
}

export interface RouterCreate {
  name: string;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  plaintext_login?: boolean;
  location?: string | null;
  description?: string | null;
  is_active?: boolean;
}

export interface RouterUpdate {
  name?: string | null;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  plaintext_login?: boolean | null;
  location?: string | null;
  description?: string | null;
  is_active?: boolean | null;
}

export interface RouterSecureSetupResponse {
  router_id: string;
  router_name: string;
  host: string;
  api_port: number;
  api_username: string;
  api_password: string;
  allowed_source: string;
  script: string;
  warning: string;
}

export interface RouterPublishScriptResponse {
  router_id: string;
  router_name: string;
  script_url: string;
  mikrotik_v7_command: string;
  mikrotik_v6_command: string;
  expires_note: string;
}

export interface RouterStatusResponse {
  connected: boolean;
  router_id: string;
  router_name: string;
  system_resource: Record<string, any> | null;
  interfaces: Record<string, any>[];
  ip_addresses: Record<string, any>[];
  dhcp_leases: Record<string, any>[];
  error: string | null;
}

export interface RouterActiveUsersResponse {
  connected: boolean;
  router_id: string;
  router_name: string;
  count: number;
  active_users: Record<string, any>[];
  error: string | null;
}

export interface RouterFeaturesResponse {
  connected: boolean;
  router_id: string;
  router_name: string;
  features: Record<string, any>;
  error: string | null;
}

export interface RouterVouchersResponse {
  connected: boolean;
  router_id: string;
  router_name: string;
  count: number;
  vouchers: Record<string, any>[];
  profiles: Record<string, any>[];
  profiles_error: string | null;
  error: string | null;
}

export interface RouterIpBinding {
  id: string;
  mac_address: string;
  address: string;
  type: "bypassed" | "blocked" | "regular";
  comment: string | null;
  server: string | null;
  disabled: boolean;
  raw: Record<string, any>;
}

export interface RouterIpBindingPayload {
  mac_address: string;
  address: string;
  type: "bypassed" | "blocked" | "regular";
  comment?: string | null;
  server?: string | null;
  disabled?: boolean;
}

export interface RouterIpBindingsResponse {
  connected: boolean;
  router_id: string;
  router_name: string;
  count: number;
  bindings: RouterIpBinding[];
  error: string | null;
}

export interface RouterLogsResponse {
  connected: boolean;
  router_id: string;
  router_name: string;
  logs: Array<Record<string, unknown>>;
  error: string | null;
}

export interface RouterRemoteAccessResponse {
  router_id: string;
  router_name: string;
  enabled: boolean;
  protocol: string;
  service: string;
  host: string;
  port: number;
  endpoint: string;
  url: string;
  api_port: number;
  api_endpoint: string;
  api_protocol: string;
}

export interface RouterPingRequest {
  target?: string | null;
  port?: number | null;
  timeout_seconds?: number;
}

export interface RouterPingResponse {
  reachable: boolean;
  host: string;
  port: number | null;
  latency_ms: number | null;
  error: string | null;
}

export interface RouterRebootResponse {
  success: boolean;
  router_id: string;
  router_name: string;
  message: string;
  error: string | null;
}

export interface RouterDeployHeartbeatResponse {
  success: boolean;
  router_id: string;
  router_name: string;
  message: string;
  error: string | null;
}

export interface RouterTestConnectionRequest {
  host: string;
  port: number;
  username: string;
  password: string;
  plaintext_login?: boolean;
}

export interface RouterTestConnectionResponse {
  reachable: boolean;
  connected: boolean;
  host: string;
  port: number;
  latency_ms: number | null;
  system_identity: string | null;
  error: string | null;
}

export interface RouterHardwareResponse {
  router_id: string;
  router_name: string;
  identity: string | null;
  ethernet_ports: Record<string, any>[];
  has_wireless: boolean;
  wireless_interfaces: Record<string, any>[];
  port_count: number;
  error: string | null;
}

export interface PppoeUser {
  username: string;
  password: string;
  profile?: string;
}

export interface HotspotProvisionConfig {
  wan_interface_index?: number;
  mgmt_interface_index?: number | null;
  bridge_ip?: string;
  bridge_subnet?: number;
  pool_start?: string;
  pool_end?: string;
  rate_limit?: string;
  pppoe_profile_name?: string;
  pppoe_service_name?: string;
  pppoe_users?: PppoeUser[];
  enable_pppoe_client?: boolean;
  isp_username?: string | null;
  isp_password?: string | null;
  dns_servers?: string;
  enable_hotspot?: boolean;
  enable_pppoe_server?: boolean;
  hotspot_dns_name?: string | null;
  enable_anti_sharing?: boolean;
  wifi_enabled?: boolean;
  wifi_ssid?: string | null;
}

export interface HotspotCommandResult {
  step: string;
  path: string;
  action: string;
  params: Record<string, any>;
  success: boolean;
  error: string | null;
}

export interface HotspotProvisionResponse {
  success: boolean;
  router_id: string;
  router_name: string;
  hardware: Record<string, any>;
  commands_executed: number;
  command_log: HotspotCommandResult[];
  error: string | null;
}

// ── Captive Portal Interfaces ──────────────────────────────────
export interface CaptivePortalResponse {
  id: string | null;
  router_id: string | null;
  router_name: string;
  title: string;
  description: string;
  phone_one: string | null;
  phone_two: string | null;
  logo_url: string | null;
  primary_color: string | null;
  portal_template: string;
  last_pushed_at: string | null;
}

export interface CaptivePortalUpsert {
  title: string;
  description: string;
  phone_one?: string | null;
  phone_two?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  portal_template?: string;
}

export interface CaptivePortalPushPayload {
  ftp_username?: string | null;
  ftp_password?: string | null;
  ftp_port?: number | null;
}

export interface PushCaptiveResponse {
  success: boolean;
  router_id: string;
  router_name: string;
  pushed_files: string[];
  deployed_directory: string | null;
  updated_profiles: string[];
  error: string | null;
  diagnostics: Record<string, string>;
}

export interface CaptivePortalDeployResponse {
  success: boolean;
  router_id: string;
  router_name: string;
  fetched_files: string[];
  deployed_directory: string | null;
  updated_profiles: string[];
  error: string | null;
  diagnostics: Record<string, string>;
}

export interface PortalAdResponse {
  id: string;
  router_id: string;
  enabled: boolean;
  advertiser_name: string;
  business_type: string;
  placement: "banner" | "flash";
  media_type: "image" | "video" | "youtube";
  title: string;
  description: string;
  media_url: string | null;
  target_url: string | null;
  duration_seconds: number;
  sort_order: number;
  impressions: number;
  views: number;
  unique_views: number;
  clicks: number;
  ctr: number;
  created_at: string;
  updated_at: string;
}

export type PortalAdUpsert = Omit<
  PortalAdResponse,
  "id" | "router_id" | "impressions" | "views" | "unique_views" | "clicks" | "ctr" | "created_at" | "updated_at"
>;

export interface PortalAdAnalyticsResponse {
  days: number;
  summary: {
    impressions: number;
    views: number;
    unique_views: number;
    clicks: number;
    ctr: number;
    view_rate: number;
    growth_percent: number;
  };
  timeline: Array<{
    date: string;
    impressions: number;
    views: number;
    unique_views: number;
    clicks: number;
  }>;
  areas: Array<{
    area: string;
    impressions: number;
    views: number;
    clicks: number;
  }>;
  ads: PortalAdResponse[];
}

export interface PublicPortalAdResponse {
  id: string;
  placement: "banner" | "flash";
  media_type: "image" | "video" | "youtube";
  title: string;
  description: string;
  media_url: string | null;
  youtube_embed_url: string | null;
  target_url: string | null;
  duration_seconds: number;
}

// ── Packages Interfaces ────────────────────────────────────────
export interface VoucherPackageResponse {
  id: number;
  package_id: number;
  limit: string;
  devices: string;
  data: string;
  profile: string;
  total: string;
  router_id: string;
  priority: number;
  speed_type: string;
  rate_limit?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RouterPackagesDataResponse {
  voucher: VoucherPackageResponse[];
}

export interface RouterPackagesResponse {
  success: boolean;
  data: RouterPackagesDataResponse;
}

export interface RouterPackagePayload {
  limit: string;
  devices: string;
  data: string;
  profile: string;
  total: string;
  priority: number;
  speed_type: string;
  rate_limit?: string | null;
}

export interface RouterPackageMutationResponse {
  success: boolean;
  package: VoucherPackageResponse;
  router_sync_error: string | null;
}

export interface RouterPackageSyncResponse {
  success: boolean;
  router_id: string;
  router_name: string;
  imported: number;
  packages: VoucherPackageResponse[];
  error: string | null;
}

export interface VoucherBatchCreate {
  package_id: number;
  quantity: number;
  amount?: number | null;
  phone_number?: string | null;
  prefix?: string;
  postfix?: string;
  code_length?: number;
  code_format?: "alphanumeric-lower" | "alphanumeric-upper" | "numeric" | "alphanumeric-mixed";
  payment_reference?: string | null;
}

export interface VoucherBatchItemResponse {
  id: string;
  router_name: string;
  phone_number: string;
  voucher_code: string;
  package_id: number;
  profile: string;
  speed_type: string;
  amount: number;
  devices: string;
  data: string;
  status: string;
  payment_reference: string | null;
  created_at: string;
  activated_at: string | null;
  expires_at: string | null;
}

export interface VoucherBatchResponse {
  success: boolean;
  count: number;
  vouchers: VoucherBatchItemResponse[];
  router_sync_error: string | null;
}

export interface VoucherJobCreatedResponse {
  job_id: string;
  status: string;
}

export interface VoucherJobResponse {
  id: string;
  router_id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "COMPLETED_WITH_ERRORS" | "FAILED";
  stage: string;
  progress: number;
  message: string;
  events: Array<{ time: string; stage: string; message: string }>;
  result: VoucherBatchResponse | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface VoucherListResponse {
  success: boolean;
  total: number;
  vouchers: VoucherBatchItemResponse[];
}

export interface VoucherCustomerInsight {
  phone_number: string;
  purchases: number;
  total_amount: number;
  last_purchase_at: string;
  segment: string;
}

export interface VoucherSupportSummaryResponse {
  success: boolean;
  total_vouchers: number;
  total_amount: number;
  active_vouchers: number;
  top_customers: VoucherCustomerInsight[];
  low_customers: VoucherCustomerInsight[];
  rare_customers: VoucherCustomerInsight[];
}

export interface MessageContactResponse {
  phone_number: string;
  wifi_name: string;
  voucher_code: string;
  purchase_count: number;
  last_purchase_at: string;
}

export interface MessageContactListResponse {
  contacts: MessageContactResponse[];
  total: number;
}

export interface BulkMessageRequest {
  phone_numbers: string[];
  message: string;
  use_voucher_template: boolean;
}

export interface MessageSendResult {
  phone_number: string;
  success: boolean;
  message: string;
  provider_response?: unknown;
}

export interface BulkMessageResponse {
  id: string;
  success: boolean;
  sent: number;
  failed: number;
  results: MessageSendResult[];
  cost_per_sms: number;
  total_charged: number;
  wallet_balance: number;
  created_at: string;
}

export interface MessageActivityResponse {
  id: string;
  branch_id: string;
  user_id: string;
  message: string;
  recipients: string[];
  message_type: "custom" | "voucher";
  status: "sending" | "completed" | "partial" | "failed";
  sent: number;
  failed: number;
  results: MessageSendResult[];
  error: string | null;
  cost_per_sms: number;
  total_charged: number;
  wallet_balance: number;
  created_at: string;
  updated_at: string;
}

export interface MessageDraftResponse {
  id: string | null;
  message: string;
  message_type: "custom" | "voucher";
  recipients: string[];
  updated_at: string | null;
}

export interface BulkSmsSettingsResponse {
  voucher_sms_enabled: boolean;
  low_balance_sms_enabled: boolean;
  low_balance_threshold: number;
  admin_buy_for_sms_enabled: boolean;
  sms_cost_ugx: number;
}

export interface SmsWalletResponse {
  id: string;
  branch_id: string;
  branch_name: string;
  balance: number;
  total_deposited: number;
  total_spent: number;
  is_frozen: boolean;
  created_at: string;
  updated_at: string;
}

export interface SmsWalletTransactionResponse {
  id: string;
  sms_wallet_id: string;
  branch_id: string;
  amount: number;
  transaction_type: string;
  reference: string | null;
  status: string;
  source_wallet_transaction_id: string | null;
  phone_number: string | null;
  gateway_reference: string | null;
  gateway_status: string | null;
  failure_reason: string | null;
  last_checked_at: string | null;
  created_at: string;
}

export interface SmsWalletMutationResponse {
  transaction: SmsWalletTransactionResponse;
  wallet: SmsWalletResponse;
}

export interface VoucherRouterSyncResponse {
  success: boolean;
  router_id: string;
  router_name: string;
  imported: number;
  updated: number;
  synced: number;
  failed: number;
  errors: string[];
}

export interface VoucherExpiryCheckResponse {
  success: boolean;
  router_id: string;
  router_name: string;
  checked: number;
  expired: number;
}

export interface VoucherDeleteResponse {
  success: boolean;
  deleted: number;
  router_deleted: number;
  errors: string[];
}

export interface PortalVoucherResponse {
  id: string;
  router_name: string;
  phone_number: string;
  voucher_code: string;
  package_id: number;
  profile: string;
  speed_type: string;
  amount: number;
  devices: string;
  data: string;
  status: string;
  payment_reference: string | null;
  created_at: string;
}

export interface PortalPaymentResponse {
  success: boolean;
  voucher: PortalVoucherResponse;
}

type RequestOptions = RequestInit & {
  auth?: boolean;
  baseUrl?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
};

function getStoredToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function saveAuth(auth: AuthResponse) {
  localStorage.setItem(AUTH_TOKEN_KEY, auth.access_token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(auth.user));
  window.dispatchEvent(new CustomEvent("renult-auth-change", { detail: auth.user }));
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  window.dispatchEvent(new CustomEvent("renult-auth-change"));
}

function getStoredUser(): UserResponse | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserResponse;
  } catch {
    return null;
  }
}

function buildUrl(path: string, query?: RequestOptions["query"], baseUrl = API_BASE_URL) {
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, baseUrl, query, headers, body, ...init } = options;
  const token = getStoredToken();
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(buildUrl(path, query, baseUrl), {
    ...init,
    headers: {
      ...(body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = data?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item: any) => item.msg).filter(Boolean).join(", ")
      : detail || data?.message || data || "Request failed";
    if (res.status === 401) clearAuth();
    throw new Error(message);
  }

  return data as T;
}

const memoryStore = <T extends { id: string }>(key: string) => {
  const read = (): T[] => JSON.parse(localStorage.getItem(key) || "[]");
  const write = (items: T[]) => localStorage.setItem(key, JSON.stringify(items));
  return {
    list: async () => read(),
    create: async (data: any) => {
      const item = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...data } as T;
      write([item, ...read()]);
      return item;
    },
    update: async (id: string, data: any) => {
      const items = read().map((item) => (item.id === id ? { ...item, ...data } : item));
      write(items);
      return items.find((item) => item.id === id);
    },
    delete: async (id: string) => {
      write(read().filter((item) => item.id !== id));
      return { message: "Deleted" };
    },
    filter: async (criteria: any) => read().filter((item) => Object.entries(criteria).every(([k, v]) => (item as any)[k] === v)),
  };
};

const localForms = memoryStore<any>("renult:forms");
const localDocuments = memoryStore<any>("renult:documents");

// ── Wallet Interfaces ──────────────────────────────────────────
export interface BranchWalletResponse {
  id: string;
  branch_id: string;
  branch_name: string;
  balance: number;
  total_deposited: number;
  total_withdrawn: number;
  total_fees_paid: number;
  is_frozen: boolean;
  created_at: string;
  updated_at: string;
}

export interface WalletTransactionResponse {
  id: string;
  wallet_id: string;
  branch_id: string;
  transaction_type: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  reference: string | null;
  status: string;
  recipient_phone: string | null;
  gateway_status: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface DepositRequest {
  amount: number;
  reference?: string | null;
}

export interface WithdrawalChallengeRequest {
  amount: number;
  recipient_phone: string;
  recipient_name: string;
  provider: string;
}

export interface WithdrawalChallengeResponse {
  challenge_id: string;
  expires_at: string;
  email_hint: string;
}

export interface WithdrawalConfirmRequest {
  challenge_id: string;
  code: string;
}

export interface WithdrawalPasscodeConfirmRequest extends WithdrawalChallengeRequest {
  passcode: string;
}

export interface WithdrawalSecurityResponse {
  passcode_enabled: boolean;
  preferred_method: "email" | "passcode";
  email_hint: string;
}

export interface DepositWithdrawResponse {
  transaction: WalletTransactionResponse;
  wallet: BranchWalletResponse;
}

export interface WithdrawalConfirmResponse extends DepositWithdrawResponse {
  receipt_email_sent: boolean;
}

export interface WithdrawalConfigResponse {
  fee_rate: number;
  min_amount: number;
  max_amount: number;
}

export interface PhoneIdentityResponse {
  identityname: string;
  message: string;
  success: boolean;
}

export interface PlatformSummaryResponse {
  total_commission: number;
  total_balance: number;
  total_deposited: number;
  total_withdrawn: number;
  total_fees_collected: number;
  total_wallets: number;
  frozen_wallets: number;
}

export interface ClientWalletSummary {
  user_id: string;
  user_name: string;
  user_email: string;
  wallets: BranchWalletResponse[];
}

export interface PlatformLedgerEntryFullResponse {
  id: string;
  branch_id: string;
  branch_name: string;
  user_id: string;
  owner_name: string;
  amount: number;
  fee_type: string;
  source_amount: number;
  fee_rate: number;
  reference: string | null;
  created_at: string;
}

export interface PlatformAllTransactionResponse {
  id: string;
  wallet_id: string;
  branch_id: string;
  branch_name: string;
  owner_name: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  transaction_type: string;
  reference: string | null;
  status: string;
  recipient_phone: string | null;
  gateway_status: string | null;
  failure_reason: string | null;
  created_at: string;
}

export const renultApi = {
  identity: {
    verifyPhone: (msisdn: string) =>
      apiRequest<PhoneIdentityResponse>("/identity/msisdn", {
        method: "POST",
        auth: false,
        headers: { Accept: "application/json" },
        body: JSON.stringify({ msisdn }),
        baseUrl: LUCOPAY_API_BASE_URL,
      }),
  },
  baseUrl: API_BASE_URL,
  auth: {
    token: getStoredToken,
    storedUser: getStoredUser,
    save: saveAuth,
    clear: clearAuth,
    googleLoginUrl: (redirect_uri?: string) =>
      apiRequest<{ authorization_url: string }>("/auth/google/login-url", { auth: false, query: { redirect_uri } }),
    register: (payload: { email: string; password: string; full_name: string; phone_number: string }) =>
      apiRequest<{ message: string }>("/auth/register", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    verifyEmail: (payload: { email: string; code: string }) =>
      apiRequest<AuthResponse>("/auth/verify-email", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    resendCode: (payload: { email: string }) =>
      apiRequest<{ message: string }>("/auth/resend-code", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    login: (payload: { email: string; password: string }) =>
      apiRequest<AuthResponse>("/auth/login", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    google: (payload: { id_token?: string; code?: string; redirect_uri?: string; full_name?: string; phone_number?: string }) =>
      apiRequest<AuthResponse>("/auth/google", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    googleCallback: (code: string) => apiRequest<AuthResponse>("/auth/google/callback", { auth: false, query: { code } }),
    forgotPassword: (payload: { email: string }) =>
      apiRequest<{ message: string }>("/auth/forgot-password", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    resetPassword: (payload: { email: string; code: string; new_password: string }) =>
      apiRequest<AuthResponse>("/auth/reset-password", { method: "POST", auth: false, body: JSON.stringify(payload) }),
    setPassword: (payload: { current_password?: string | null; new_password: string }) =>
      apiRequest<{ message: string }>("/auth/set-password", { method: "POST", body: JSON.stringify(payload) }),
    me: () => apiRequest<UserResponse>("/auth/me"),
    updateMe: (payload: UserProfileUpdate) =>
      apiRequest<UserResponse>("/auth/me", { method: "PATCH", body: JSON.stringify(payload) }),
    loginActivity: (limit = 10) =>
      apiRequest<LoginActivityResponse[]>("/auth/login-activity", { query: { limit } }),
    exchangeSubdomainHandoff: (payload: { code: string; subdomain: string }) =>
      apiRequest<AuthResponse>("/auth/subdomain-handoff/exchange", {
        method: "POST",
        auth: false,
        body: JSON.stringify(payload),
      }),
  },
  branches: {
    list: (query?: { limit?: number; offset?: number }) => apiRequest<BranchResponse[]>("/branches", { query }),
    create: (payload: { name: string }) => apiRequest<BranchResponse>("/branches", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: { name?: string; avatar_url?: string }) =>
      apiRequest<BranchResponse>(`/branches/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    delete: (id: string) => apiRequest<{ message: string }>(`/branches/${id}`, { method: "DELETE" }),
  },
  staff: {
    list: (branchId: string, query?: { limit?: number; offset?: number }) =>
      apiRequest<StaffResponse[]>(`/branches/${branchId}/staff`, { query }),
    create: (branchId: string, payload: { full_name: string; email: string; phone_number?: string | null; role?: string | null; permissions?: string[]; share_percentage?: number }) =>
      apiRequest<StaffResponse>(`/branches/${branchId}/staff`, { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<{ full_name: string; email: string; phone_number: string | null; role: string; permissions: string[]; share_percentage: number; is_active: boolean; avatar_url: string }>) =>
      apiRequest<StaffResponse>(`/staff/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    delete: (id: string) => apiRequest<{ message: string }>(`/staff/${id}`, { method: "DELETE" }),
    revenueShare: (branchId: string) =>
      apiRequest<RevenueShareResponse>(`/branches/${branchId}/revenue-share`),
  },
  notifications: {
    list: (query?: { category?: string; unread_only?: boolean; limit?: number; offset?: number }) =>
      apiRequest<NotificationListResponse>("/notifications", { query }),
    markRead: (notification_ids: string[]) =>
      apiRequest<{ message: string }>("/notifications/mark-read", { method: "POST", body: JSON.stringify({ notification_ids }) }),
    markAllRead: () => apiRequest<{ message: string }>("/notifications/mark-all-read", { method: "POST" }),
    unreadCount: () => apiRequest<{ unread_count?: number; count?: number }>("/notifications/unread-count"),
    delete: (id: string) => apiRequest<{ message: string }>(`/notifications/${id}`, { method: "DELETE" }),
  },
  monitoring: {
    summary: (branchId?: string | null) =>
      apiRequest<RouterMonitorSummary>("/snmp/status-summary", { query: { branch_id: branchId } }),
    enableSnmp: (routerId: string) =>
      apiRequest<SnmpEnableResponse>(`/routers/${routerId}/snmp/enable`, {
        method: "POST",
      }),
    preferences: () =>
      apiRequest<NotificationPreferenceResponse>("/notification-preferences"),
    updatePreferences: (payload: Omit<NotificationPreferenceResponse, "sms_cost_ugx">) =>
      apiRequest<NotificationPreferenceResponse>("/notification-preferences", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
  },
  telegram: {
    connection: () =>
      apiRequest<TelegramConnectionResponse>("/telegram/connection"),
    connect: (bot_token: string, slot = 1) =>
      apiRequest<TelegramConnectionResponse>("/telegram/connection", {
        method: "POST",
        body: JSON.stringify({ bot_token, slot }),
      }),
    updatePreferences: (payload: TelegramPreferenceUpdate) =>
      apiRequest<TelegramConnectionResponse>("/telegram/preferences", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    test: () =>
      apiRequest<{ success: boolean; message: string }>("/telegram/test", {
        method: "POST",
      }),
    disconnect: (slot = 1) =>
      apiRequest<{ success: boolean; message: string }>("/telegram/connection", {
        method: "DELETE",
        query: { slot },
      }),
  },
  uploads: {
    upload: async (file: File, folder = "general") => {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", folder);
      return apiRequest<UploadResponse>("/uploads", { method: "POST", body: form });
    },
  },
  subscriptions: {
    list: (query?: { limit?: number; active_only?: boolean; send_due_alerts?: boolean }) =>
      apiRequest<SubscriptionResponse[]>("/subscriptions", { query }),
    create: (payload: SubscriptionPayload) =>
      apiRequest<SubscriptionResponse>("/subscriptions", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<SubscriptionPayload>) =>
      apiRequest<SubscriptionResponse>(`/subscriptions/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    notify: (id: string) =>
      apiRequest<{ message: string }>(`/subscriptions/${id}/notify`, { method: "POST" }),
    delete: (id: string) =>
      apiRequest<{ message: string }>(`/subscriptions/${id}`, { method: "DELETE" }),
  },
  tickets: {
    categories: () => apiRequest<TicketCategoryResponse[]>("/tickets/categories"),
    list: (branchId: string, query?: { status_filter?: string; priority_filter?: string; limit?: number; offset?: number }) =>
      apiRequest<TicketResponse[]>(`/branches/${branchId}/tickets`, { query }),
    create: (branchId: string, payload: { category_id: string; title: string; description: string; priority?: string | null }) =>
      apiRequest<TicketResponse>(`/branches/${branchId}/tickets`, { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: Partial<{ category_id: string; title: string; description: string; priority: string; status: string; assigned_staff_id: string | null }>) =>
      apiRequest<TicketResponse>(`/tickets/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    delete: (id: string) => apiRequest<{ message: string }>(`/tickets/${id}`, { method: "DELETE" }),
  },
  routers: {
    list: (branchId: string, query?: { limit?: number; offset?: number }) =>
      apiRequest<RouterResponse[]>(`/branches/${branchId}/routers`, { query }),
    get: (routerId: string) =>
      apiRequest<RouterResponse>(`/routers/${routerId}`),
    create: (branchId: string, payload: RouterCreate) =>
      apiRequest<RouterResponse>(`/branches/${branchId}/routers`, { method: "POST", body: JSON.stringify(payload) }),
    update: (routerId: string, payload: RouterUpdate) =>
      apiRequest<RouterResponse>(`/routers/${routerId}`, { method: "PUT", body: JSON.stringify(payload) }),
    delete: (routerId: string) =>
      apiRequest<{ message: string }>(`/routers/${routerId}`, { method: "DELETE" }),
    status: (routerId: string) =>
      apiRequest<RouterStatusResponse>(`/routers/${routerId}/status`),
    features: (routerId: string) =>
      apiRequest<RouterFeaturesResponse>(`/routers/${routerId}/features`),
    activeUsers: (routerId: string) =>
      apiRequest<RouterActiveUsersResponse>(`/routers/${routerId}/active-users`),
    kickActiveUser: (routerId: string, activeId: string) =>
      apiRequest<{ message: string }>(`/routers/${routerId}/active-users/${encodeURIComponent(activeId)}`, { method: "DELETE" }),
    vouchers: (routerId: string) =>
      apiRequest<RouterVouchersResponse>(`/routers/${routerId}/vouchers`),
    ipBindings: (routerId: string) =>
      apiRequest<RouterIpBindingsResponse>(`/routers/${routerId}/ip-bindings`),
    createIpBinding: (routerId: string, payload: RouterIpBindingPayload) =>
      apiRequest<RouterIpBinding>(`/routers/${routerId}/ip-bindings`, { method: "POST", body: JSON.stringify(payload) }),
    updateIpBinding: (routerId: string, bindingId: string, payload: RouterIpBindingPayload) =>
      apiRequest<RouterIpBinding>(`/routers/${routerId}/ip-bindings/${encodeURIComponent(bindingId)}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteIpBinding: (routerId: string, bindingId: string) =>
      apiRequest<{ message: string }>(`/routers/${routerId}/ip-bindings/${encodeURIComponent(bindingId)}`, { method: "DELETE" }),
    logs: (routerId: string, limit = 200) =>
      apiRequest<RouterLogsResponse>(`/routers/${routerId}/logs`, { query: { limit } }),
    remoteAccess: (routerId: string) =>
      apiRequest<RouterRemoteAccessResponse>(`/routers/${routerId}/remote-access`),
    secureSetup: (routerId: string) =>
      apiRequest<RouterSecureSetupResponse>(`/routers/${routerId}/secure-setup`, {
        query: { api_base_url: API_BASE_URL },
      }),
    publishSetupScript: (routerId: string) =>
      apiRequest<RouterPublishScriptResponse>(`/routers/${routerId}/publish-setup-script`, {
        method: "POST",
        body: JSON.stringify({ api_base_url: API_BASE_URL, include_walled_garden: true }),
      }),
    ping: (routerId: string, payload: RouterPingRequest) =>
      apiRequest<RouterPingResponse>(`/routers/${routerId}/ping`, { method: "POST", body: JSON.stringify(payload) }),
    reboot: (routerId: string) =>
      apiRequest<RouterRebootResponse>(`/routers/${routerId}/reboot`, { method: "POST" }),
    deployHeartbeat: (routerId: string) =>
      apiRequest<RouterDeployHeartbeatResponse>(`/routers/${routerId}/deploy-heartbeat`, {
        method: "POST",
        body: JSON.stringify({ api_base_url: API_BASE_URL }),
      }),
    testConnection: (payload: RouterTestConnectionRequest) =>
      apiRequest<RouterTestConnectionResponse>("/routers/test-connection", { method: "POST", body: JSON.stringify(payload) }),
    hardware: (routerId: string) =>
      apiRequest<RouterHardwareResponse>(`/routers/${routerId}/hardware`),
    provisionHotspot: (routerId: string, payload: HotspotProvisionConfig) =>
      apiRequest<HotspotProvisionResponse>(`/routers/${routerId}/provision-hotspot`, { method: "POST", body: JSON.stringify(payload) }),
    updateTrial: (routerId: string, payload: RouterTrialUpdate) =>
      apiRequest<RouterTrialResponse>(`/routers/${routerId}/trial`, { method: "PUT", body: JSON.stringify(payload) }),
  },
  captivePortal: {
    get: (routerId: string) =>
      apiRequest<CaptivePortalResponse>(`/routers/${routerId}/captive`),
    upsert: (routerId: string, payload: CaptivePortalUpsert) =>
      apiRequest<CaptivePortalResponse>(`/routers/${routerId}/captive`, { method: "PUT", body: JSON.stringify(payload) }),
    push: (routerId: string, payload?: CaptivePortalPushPayload) =>
      apiRequest<PushCaptiveResponse>(`/routers/${routerId}/captive/push`, {
        method: "POST",
        body: JSON.stringify(payload || {}),
      }),
    deployR2: (routerId: string) =>
      apiRequest<CaptivePortalDeployResponse>(`/routers/${routerId}/captive/deploy-r2`, {
        method: "POST",
      }),
    publicConfig: (routerName: string) =>
      apiRequest<CaptivePortalResponse>(`/portal/${routerName}`, { auth: false }),
    publicPackages: (routerName: string) =>
      apiRequest<any>(`/portal/${routerName}/packages`, { auth: false }),
    publicExists: (routerName: string) =>
      apiRequest<any>(`/portal/router/${routerName}/exists`, { auth: false }),
    createVoucher: (routerName: string, payload: { phone_number: string; package_id: number; payment_reference?: string | null; buy_for?: string }) =>
      apiRequest<PortalPaymentResponse>(`/portal/${routerName}/payments`, { method: "POST", auth: false, body: JSON.stringify(payload) }),
  },
  ads: {
    list: (routerId: string) =>
      apiRequest<PortalAdResponse[]>(`/routers/${routerId}/ads`),
    create: (routerId: string, payload: PortalAdUpsert) =>
      apiRequest<PortalAdResponse>(`/routers/${routerId}/ads`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (routerId: string, adId: string, payload: PortalAdUpsert) =>
      apiRequest<PortalAdResponse>(`/routers/${routerId}/ads/${adId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    delete: (routerId: string, adId: string) =>
      apiRequest<void>(`/routers/${routerId}/ads/${adId}`, { method: "DELETE" }),
    analytics: (routerId: string, days = 30) =>
      apiRequest<PortalAdAnalyticsResponse>(`/routers/${routerId}/ads/analytics`, {
        query: { days },
      }),
    public: (routerName: string) =>
      apiRequest<{ ads: PublicPortalAdResponse[]; rotation_seconds: number }>(`/portal/${routerName}/ads`, { auth: false }),
  },
  packages: {
    list: (routerId: string) =>
      apiRequest<RouterPackagesResponse>("/packages", { query: { router_id: routerId } }),
    listForRouter: (routerId: string) =>
      apiRequest<RouterPackagesResponse>(`/routers/${routerId}/packages`),
    create: (routerId: string, payload: RouterPackagePayload) =>
      apiRequest<RouterPackageMutationResponse>(`/routers/${routerId}/packages`, { method: "POST", body: JSON.stringify(payload) }),
    update: (routerId: string, packageRowId: number, payload: Partial<RouterPackagePayload>) =>
      apiRequest<RouterPackageMutationResponse>(`/routers/${routerId}/packages/${packageRowId}`, { method: "PUT", body: JSON.stringify(payload) }),
    delete: (routerId: string, packageRowId: number) =>
      apiRequest<{ message: string }>(`/routers/${routerId}/packages/${packageRowId}`, { method: "DELETE" }),
    sync: (routerId: string) =>
      apiRequest<RouterPackageSyncResponse>(`/routers/${routerId}/packages/sync`, { method: "POST" }),
    createVouchers: (routerId: string, payload: VoucherBatchCreate) =>
      apiRequest<VoucherBatchResponse>(`/routers/${routerId}/vouchers`, { method: "POST", body: JSON.stringify(payload) }),
    queueVouchers: (routerId: string, payload: VoucherBatchCreate) =>
      apiRequest<VoucherJobCreatedResponse>(`/routers/${routerId}/voucher-jobs`, { method: "POST", body: JSON.stringify(payload) }),
    voucherJob: (jobId: string) =>
      apiRequest<VoucherJobResponse>(`/voucher-jobs/${jobId}`),
    fetchVouchers: (routerId: string) =>
      apiRequest<VoucherRouterSyncResponse>(`/routers/${routerId}/vouchers/fetch`, { method: "POST" }),
    syncVouchers: (routerId: string) =>
      apiRequest<VoucherRouterSyncResponse>(`/routers/${routerId}/vouchers/sync`, { method: "POST" }),
    checkExpiredVouchers: (routerId: string) =>
      apiRequest<VoucherExpiryCheckResponse>(`/routers/${routerId}/vouchers/expired/check`, { method: "POST" }),
    deleteExpiredVouchers: (routerId: string) =>
      apiRequest<VoucherDeleteResponse>(`/routers/${routerId}/vouchers/expired`, { method: "DELETE" }),
    deleteVoucher: (routerId: string, voucherCode: string) =>
      apiRequest<VoucherDeleteResponse>(`/routers/${routerId}/vouchers/${encodeURIComponent(voucherCode)}`, { method: "DELETE" }),
    deleteVoucherBatch: (routerId: string, batchId: string) =>
      apiRequest<VoucherDeleteResponse>(`/routers/${routerId}/voucher-batches/${encodeURIComponent(batchId)}`, { method: "DELETE" }),
    branchVouchers: (branchId: string, query?: { limit?: number; offset?: number; search?: string; status_filter?: string; refresh_router_status?: boolean }) =>
      apiRequest<VoucherListResponse>(`/branches/${branchId}/vouchers`, { query }),
    supportSummary: (branchId: string) =>
      apiRequest<VoucherSupportSummaryResponse>(`/branches/${branchId}/voucher-support-summary`),
  },
  platformAdmin: {
    overview: () => apiRequest<PlatformOverviewResponse>("/platform-admin/overview"),
    users: (search = "") => apiRequest<PlatformUserResponse[]>("/platform-admin/users", { query: { search: search || undefined, limit: 500 } }),
    user: (userId: string) =>
      apiRequest<PlatformUserDetailResponse>(`/platform-admin/users/${userId}`),
    updateUser: (userId: string, payload: PlatformUserUpdate, method: "PATCH" | "PUT" = "PATCH") =>
      apiRequest<PlatformUserResponse>(`/platform-admin/users/${userId}`, { method, body: JSON.stringify(payload) }),
    updateUserBranch: (userId: string, branchId: string, payload: { name: string }, method: "PATCH" | "PUT" = "PATCH") =>
      apiRequest<{ message: string }>(`/platform-admin/users/${userId}/branches/${branchId}`, { method, body: JSON.stringify(payload) }),
    syncUserSubdomain: (userId: string) =>
      apiRequest<{ message: string }>(`/platform-admin/users/${userId}/subdomain/sync`, { method: "POST" }),
    updateSubadmin: (userId: string, payload: { role: "subadmin" | "none"; permissions: string[]; platform_fee_share_percentage?: number }) =>
      apiRequest<PlatformUserResponse>(`/platform-admin/subadmins/${userId}`, { method: "PUT", body: JSON.stringify(payload) }),
    settings: () => apiRequest<PlatformSettingsResponse>("/platform-admin/settings"),
    updateSettings: (payload: PlatformSettingsResponse) =>
      apiRequest<PlatformSettingsResponse>("/platform-admin/settings", { method: "PUT", body: JSON.stringify(payload) }),
    wallets: () => apiRequest<PlatformWalletResponse[]>("/platform-admin/wallets"),
    freezeWallet: (walletId: string, frozen: boolean) =>
      apiRequest<{ message: string }>(`/platform-admin/wallets/${walletId}/freeze`, { method: "POST", query: { frozen } }),
    tunnels: () => apiRequest<PlatformTunnelResponse[]>("/platform-admin/tunnels"),
    setTunnelActive: (routerId: string, active: boolean) =>
      apiRequest<{ message: string }>(`/platform-admin/tunnels/${routerId}/active`, { method: "POST", query: { active } }),
    routers: (search = "") =>
      apiRequest<PlatformRouterResponse[]>("/platform-admin/routers", { query: { search: search || undefined, limit: 500 } }),
    router: (routerId: string) =>
      apiRequest<PlatformRouterResponse>(`/platform-admin/routers/${routerId}`),
    updateRouter: (routerId: string, payload: PlatformRouterUpdate) =>
      apiRequest<PlatformRouterResponse>(`/platform-admin/routers/${routerId}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteRouter: (routerId: string) =>
      apiRequest<{ message: string }>(`/platform-admin/routers/${routerId}`, { method: "DELETE" }),
    routerLogs: (routerId: string, limit = 200) =>
      apiRequest<RouterLogsResponse>(`/platform-admin/routers/${routerId}/logs`, { query: { limit } }),
    pingRouter: (routerId: string, target = "8.8.8.8") =>
      apiRequest<RouterPingResponse>(`/platform-admin/routers/${routerId}/ping`, {
        method: "POST",
        body: JSON.stringify({ target }),
      }),
    pushRouterCommand: (payload: PlatformRouterCommandRequest) =>
      apiRequest<PlatformRouterCommandResponse>("/platform-admin/router-commands", { method: "POST", body: JSON.stringify(payload) }),
    voucherAudit: (search = "") =>
      apiRequest<PlatformVoucherAuditResponse[]>("/platform-admin/voucher-audit", { query: { search: search || undefined, limit: 500 } }),
    messageDiagnostics: (query?: { search?: string; status_filter?: string; limit?: number }) =>
      apiRequest<PlatformMessageDiagnosticResponse[]>("/platform-admin/message-diagnostics", { query }),
    smsGateways: () =>
      apiRequest<SmsGatewayResponse[]>("/platform-admin/sms-gateways"),
    updateSmsGateway: (provider: string, payload: SmsGatewayUpdatePayload) =>
      apiRequest<SmsGatewayResponse[]>(`/platform-admin/sms-gateways/${provider}`, { method: "PUT", body: JSON.stringify(payload) }),
    setDefaultSmsGateway: (provider: string) =>
      apiRequest<SmsGatewayResponse[]>(`/platform-admin/sms-gateways/${provider}/default`, { method: "POST" }),
    smsGatewayBalance: (provider: string) =>
      apiRequest<SmsGatewayBalanceResponse>(`/platform-admin/sms-gateways/${provider}/balance`),
    audit: () => apiRequest<PlatformAuditResponse[]>("/platform-admin/audit", { query: { limit: 500 } }),
    storage: (prefix = "") =>
      apiRequest<PlatformStorageObjectResponse[]>("/platform-admin/storage", { query: { prefix } }),
    deleteStorage: (key: string) =>
      apiRequest<{ message: string }>("/platform-admin/storage", { method: "DELETE", query: { key } }),
    broadcast: (payload: { channels: string[]; user_ids: string[]; send_to_all: boolean; subject: string; message: string }) =>
      apiRequest<{ recipients: number; email_sent: number; sms_sent: number; failed: number }>("/platform-admin/broadcasts", { method: "POST", body: JSON.stringify(payload) }),
    dnsZones: () => apiRequest<PlatformDnsZoneResponse[]>("/platform-admin/dns/zones"),
    dnsRecords: (zoneId: string) => apiRequest<PlatformDnsRecordResponse[]>(`/platform-admin/dns/zones/${zoneId}/records`),
    createDnsRecord: (zoneId: string, payload: { name: string; type: string; content: string; ttl: number; disabled: boolean; proxied?: boolean }) =>
      apiRequest<{ message: string }>(`/platform-admin/dns/zones/${zoneId}/records`, { method: "POST", body: JSON.stringify(payload) }),
    deleteDnsRecord: (zoneId: string, recordId: string) =>
      apiRequest<{ message: string }>(`/platform-admin/dns/zones/${zoneId}/records/${recordId}`, { method: "DELETE" }),
    health: () => apiRequest<PlatformHealthResponse>("/platform-admin/health"),
    createUser: (payload: { email: string; full_name: string; phone_number?: string; password?: string }) =>
      apiRequest<{ user: PlatformUserResponse; temp_password: string | null }>("/platform-admin/users", { method: "POST", body: JSON.stringify(payload) }),
    deleteUser: (userId: string) =>
      apiRequest<{ message: string }>(`/platform-admin/users/${userId}`, { method: "DELETE" }),
    blockUser: (userId: string, payload: { permanent: boolean; blocked_until?: string | null }) =>
      apiRequest<PlatformUserResponse>(`/platform-admin/users/${userId}/block`, { method: "POST", body: JSON.stringify(payload) }),
    unblockUser: (userId: string) =>
      apiRequest<PlatformUserResponse>(`/platform-admin/users/${userId}/unblock`, { method: "POST" }),
    resetUserPassword: (userId: string) =>
      apiRequest<{ user_id: string; temp_password: string }>(`/platform-admin/users/${userId}/reset-password`, { method: "POST" }),
    loginAttempts: (limit = 200) =>
      apiRequest<PlatformLoginAttemptResponse[]>("/platform-admin/login-attempts", { query: { limit } }),
    sessions: (limit = 200) =>
      apiRequest<PlatformSessionResponse[]>("/platform-admin/sessions", { query: { limit } }),
    revokeSession: (sessionId: string) =>
      apiRequest<{ message: string }>(`/platform-admin/sessions/${sessionId}/revoke`, { method: "POST" }),
    notifications: (limit = 200) =>
      apiRequest<PlatformNotificationResponse[]>("/platform-admin/notifications", { query: { limit } }),
    deleteNotification: (notificationId: string) =>
      apiRequest<{ message: string }>(`/platform-admin/notifications/${notificationId}`, { method: "DELETE" }),
    clearNotifications: () =>
      apiRequest<{ message: string }>("/platform-admin/notifications", { method: "DELETE" }),
    deleteMessageDiagnostic: (messageId: string) =>
      apiRequest<{ message: string }>(`/platform-admin/message-diagnostics/${messageId}`, { method: "DELETE" }),
    clearMessageDiagnostics: () =>
      apiRequest<{ message: string }>("/platform-admin/message-diagnostics", { method: "DELETE" }),
    routerAds: (routerId: string) =>
      apiRequest<PortalAdResponse[]>(`/platform-admin/routers/${routerId}/ads`),
    createRouterAd: (routerId: string, payload: PortalAdUpsert) =>
      apiRequest<PortalAdResponse>(`/platform-admin/routers/${routerId}/ads`, { method: "POST", body: JSON.stringify(payload) }),
    updateRouterAd: (routerId: string, adId: string, payload: PortalAdUpsert) =>
      apiRequest<PortalAdResponse>(`/platform-admin/routers/${routerId}/ads/${adId}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteRouterAd: (routerId: string, adId: string) =>
      apiRequest<{ message: string }>(`/platform-admin/routers/${routerId}/ads/${adId}`, { method: "DELETE" }),
    routerAdAnalytics: (routerId: string, days = 30) =>
      apiRequest<PortalAdAnalyticsResponse>(`/platform-admin/routers/${routerId}/ads/analytics`, { query: { days } }),
    publishRouterAdsMob: (routerId: string) =>
      apiRequest<PushCaptiveResponse>(`/platform-admin/routers/${routerId}/adsmob/publish`, { method: "POST" }),
    pushRouterCaptive: (routerId: string) =>
      apiRequest<PushCaptiveResponse>(`/platform-admin/routers/${routerId}/captive/push`, { method: "POST" }),
    setRouterCredentials: (routerId: string, payload: { username: string; password: string }) =>
      apiRequest<{ message: string }>(`/platform-admin/routers/${routerId}/credentials`, { method: "POST", body: JSON.stringify(payload) }),
  },
  messages: {
    contacts: (branchId: string, query?: { search?: string; limit?: number }) =>
      apiRequest<MessageContactListResponse>(`/branches/${branchId}/message-contacts`, { query }),
    send: (branchId: string, payload: BulkMessageRequest) =>
      apiRequest<BulkMessageResponse>(`/branches/${branchId}/messages/send`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    activity: (branchId: string, limit = 50) =>
      apiRequest<{ activities: MessageActivityResponse[]; total: number }>(
        `/branches/${branchId}/messages`,
        { query: { limit } },
      ),
    draft: (branchId: string) =>
      apiRequest<MessageDraftResponse>(`/branches/${branchId}/messages/draft`),
    saveDraft: (
      branchId: string,
      payload: Pick<MessageDraftResponse, "message" | "message_type" | "recipients">,
    ) =>
      apiRequest<MessageDraftResponse>(`/branches/${branchId}/messages/draft`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    settings: (branchId: string) =>
      apiRequest<BulkSmsSettingsResponse>(`/branches/${branchId}/messages/settings`),
    saveSettings: (
      branchId: string,
      payload: Omit<BulkSmsSettingsResponse, "sms_cost_ugx">,
    ) =>
      apiRequest<BulkSmsSettingsResponse>(`/branches/${branchId}/messages/settings`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    wallet: (branchId: string) =>
      apiRequest<SmsWalletResponse>(`/branches/${branchId}/messages/wallet`),
    walletTransactions: (branchId: string, query?: { limit?: number; offset?: number }) =>
      apiRequest<SmsWalletTransactionResponse[]>(`/branches/${branchId}/messages/wallet/transactions`, { query }),
    transferToWallet: (branchId: string, payload: { amount: number }) =>
      apiRequest<SmsWalletMutationResponse>(`/branches/${branchId}/messages/wallet/transfer`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    mobileMoneyTopup: (branchId: string, payload: { amount: number; phone_number: string }) =>
      apiRequest<SmsWalletMutationResponse>(`/branches/${branchId}/messages/wallet/mobile-money-topups`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    verifyMobileMoneyTopup: (branchId: string, transactionId: string) =>
      apiRequest<SmsWalletMutationResponse>(`/branches/${branchId}/messages/wallet/mobile-money-topups/${transactionId}/status`),
  },
  wallets: {
    config: () =>
      apiRequest<WithdrawalConfigResponse>("/wallets/config"),
    myWallets: () =>
      apiRequest<BranchWalletResponse[]>("/wallets/my-wallets"),
    getBranchWallet: (branchId: string) =>
      apiRequest<BranchWalletResponse>(`/wallets/branch/${branchId}`),
    branchTransactions: (branchId: string, query?: { limit?: number; offset?: number }) =>
      apiRequest<WalletTransactionResponse[]>(`/wallets/branch/${branchId}/transactions`, { query }),
    deposit: (branchId: string, payload: DepositRequest) =>
      apiRequest<DepositWithdrawResponse>(`/wallets/branch/${branchId}/deposit`, { method: "POST", body: JSON.stringify(payload) }),
    requestWithdrawal: (branchId: string, payload: WithdrawalChallengeRequest) =>
      apiRequest<WithdrawalChallengeResponse>(`/wallets/branch/${branchId}/withdrawal-challenges`, { method: "POST", body: JSON.stringify(payload) }),
    confirmWithdrawal: (branchId: string, payload: WithdrawalConfirmRequest) =>
      apiRequest<WithdrawalConfirmResponse>(`/wallets/branch/${branchId}/withdrawal-confirmations`, { method: "POST", body: JSON.stringify(payload) }),
    withdrawalSecurity: (branchId: string) =>
      apiRequest<WithdrawalSecurityResponse>(`/wallets/branch/${branchId}/withdrawal-security`),
    setWithdrawalPasscode: (branchId: string, passcode: string) =>
      apiRequest<WithdrawalSecurityResponse>(`/wallets/branch/${branchId}/withdrawal-passcode`, { method: "POST", body: JSON.stringify({ passcode }) }),
    requestWithdrawalPasscodeReset: (branchId: string) =>
      apiRequest<WithdrawalChallengeResponse>(`/wallets/branch/${branchId}/withdrawal-passcode`, { method: "DELETE" }),
    confirmWithdrawalPasscodeReset: (branchId: string, payload: WithdrawalConfirmRequest) =>
      apiRequest<WithdrawalSecurityResponse>(`/wallets/branch/${branchId}/withdrawal-passcode/reset`, { method: "POST", body: JSON.stringify(payload) }),
    setWithdrawalMethod: (branchId: string, method: "email" | "passcode") =>
      apiRequest<WithdrawalSecurityResponse>(`/wallets/branch/${branchId}/withdrawal-method`, { method: "PUT", body: JSON.stringify({ method }) }),
    confirmWithdrawalWithPasscode: (branchId: string, payload: WithdrawalPasscodeConfirmRequest) =>
      apiRequest<WithdrawalConfirmResponse>(`/wallets/branch/${branchId}/withdrawal-passcode-confirmations`, { method: "POST", body: JSON.stringify(payload) }),
    checkWithdrawalStatus: (branchId: string, transactionId: string) =>
      apiRequest<WalletTransactionResponse>(`/wallets/branch/${branchId}/withdrawals/${transactionId}/status`),
    platformLedger: (limit = 200) =>
      apiRequest<PlatformLedgerEntryFullResponse[]>("/platform-admin/ledger", { query: { limit } }),
    platformAllTransactions: (limit = 200) =>
      apiRequest<PlatformAllTransactionResponse[]>("/platform-admin/all-transactions", { query: { limit } }),
    platformSummary: () =>
      apiRequest<PlatformSummaryResponse>("/wallets/platform/summary"),
    platformClients: () =>
      apiRequest<ClientWalletSummary[]>("/wallets/platform/clients"),
    platformClientDetail: (userId: string) =>
      apiRequest<ClientWalletSummary>(`/wallets/platform/clients/${userId}`),
    freezeWallet: (walletId: string) =>
      apiRequest<{ message: string }>(`/wallets/platform/freeze/${walletId}`, { method: "POST" }),
    unfreezeWallet: (walletId: string) =>
      apiRequest<{ message: string }>(`/wallets/platform/unfreeze/${walletId}`, { method: "POST" }),
  },
};

export const base44 = {
  auth: {
    me: renultApi.auth.me,
    logout: async () => clearAuth(),
  },
  entities: {
    Form: localForms,
    Document: localDocuments,
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }: { file: File }) => {
        const uploaded = await renultApi.uploads.upload(file);
        return { file_url: uploaded.url, key: uploaded.key };
      },
      InvokeLLM: async () => ({ response: "AI is not configured for this API yet." }),
    },
    Connections: { status: async () => ({}) },
    Google: {
      status: async () => ({}),
      getAuthUrl: async () => ({ auth_url: "#" }),
      disconnect: async () => ({ message: "Disconnected" }),
      pushToDrive: async () => ({ url: "#" }),
    },
    Twitter: {
      getAuthUrl: async () => ({ auth_url: "#", code_verifier: "", redirect_uri: "" }),
      disconnect: async () => ({ message: "Disconnected" }),
    },
    Sheets: { push: async () => ({ url: "#" }) },
    Drive: { smartUpload: async (file: File) => ({ file_url: URL.createObjectURL(file) }) },
  },
};
