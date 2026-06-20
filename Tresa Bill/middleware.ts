// NOTE: This file uses the Vercel Edge Middleware API.
// For Vite projects deployed on Vercel, we use the standard Web Request/Response.

const BOT_USER_AGENTS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'LinkedInBot',
  'WhatsApp',
  'TelegramBot',
  'Slackbot',
  'Discordbot',
  'Pinterest',
  'Googlebot',
  'bingbot',
  'Baiduspider',
  'yandex',
  'Applebot',
  'Pinterestbot',
  'Slurp',
  'DuckDuckBot',
  'ia_archiver',
  'Embedly',
  'Quora Link Preview',
  'showyoubot',
  'outbrain',
  'vkShare',
  'W3C_Validator',
  'redditbot',
  'Applebot',
  'rogerbot',
  'Screaming Frog',
  'OGP',
];

declare const process: { env: Record<string, string> };

// Backend API base – swap for your production backend if different
const BACKEND_API =
  process.env.VITE_API_BASE ||
  process.env.API_BASE ||
  'https://api.pitbox.fun/api';

const FRONTEND_ORIGIN = 'https://form.pitbox.fun';

/**
 * Escape HTML entities to prevent XSS in generated OG pages.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strip HTML tags from a string (for descriptions stored as rich text).
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Truncate a string to a maximum length, appending ellipsis if truncated.
 */
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

export const config = {
  matcher: '/f/:id*',
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';

  // Helper to pass through the request to the underlying application
  const passThrough = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

  // Only intercept for known bot user agents
  const isBot = BOT_USER_AGENTS.some((bot) =>
    userAgent.toLowerCase().includes(bot.toLowerCase())
  );

  if (!isBot) {
    // Not a bot let Vercel serve the normal SPA
    return passThrough();
  }

  // Extract form ID from the path: /f/<form_id>
  const match = url.pathname.match(/^\/f\/([^/]+)/);
  if (!match) {
    return passThrough();
  }

  const formId = match[1];

  try {
    // Fetch form data from the backend (public endpoint, no auth needed)
    const apiUrl = `${BACKEND_API}/forms/${formId}`;
    const res = await fetch(apiUrl, {
      headers: { 'Content-Type': 'application/json' },
      // Edge runtime supports fetch natively
    });

    if (!res.ok) {
      // Form not found or error fall through to SPA
      return passThrough();
    }

    const form = await res.json();

    // Build OG metadata
    const title = escapeHtml(form.title || 'Form');
    const rawDescription = stripHtml(form.description || '');
    const description = escapeHtml(
      truncate(
        rawDescription || `Fill out "${form.title}" on Foreform`,
        160
      )
    );
    const branding = form.branding || {};
    const organization = escapeHtml(branding.organization || 'Foreform');

    // Use the form's logo if available, otherwise the default OG image
    const ogImage = branding.logo_url || `${FRONTEND_ORIGIN}/og-image.png`;
    const canonicalUrl = `${FRONTEND_ORIGIN}/f/${formId}`;
    const fullTitle = `${title} | ${organization}`;

    // Build a minimal HTML page with proper OG meta tags
    // The page also includes a redirect to the real SPA for any user that somehow sees this
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary SEO -->
  <title>${fullTitle}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${canonicalUrl}" />

  <!-- Open Graph (Facebook, LinkedIn, WhatsApp) -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Foreform" />
  <meta property="og:title" content="${fullTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${fullTitle}" />
  <meta property="og:locale" content="en_US" />

  <!-- Twitter / X Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${fullTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  <meta name="twitter:image:alt" content="${fullTitle}" />

  <!-- Favicon -->
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />

  <!-- Redirect real users to the SPA -->
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}" />
</head>
<body>
  <h1>${fullTitle}</h1>
  <p>${description}</p>
  <p>Redirecting to <a href="${canonicalUrl}">${canonicalUrl}</a>…</p>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
      },
    });
  } catch (error) {
    // On any error, fall through to the normal SPA
    console.error('OG middleware error:', error);
    return passThrough();
  }
}
