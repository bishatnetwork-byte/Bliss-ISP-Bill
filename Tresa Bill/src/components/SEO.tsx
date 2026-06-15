import { Helmet } from 'react-helmet-async';

interface SEOProps {
    /** Page title – will be appended with "| Renault" */
    title?: string;
    /** Meta description – keep under 160 characters */
    description?: string;
    /** Comma-separated keywords for this page */
    keywords?: string;
    /** Canonical URL path (e.g. "/agent"). Full URL is constructed automatically. */
    path?: string;
    /** OpenGraph image URL */
    ogImage?: string;
    /** OpenGraph type – defaults to "website" */
    ogType?: string;
    /** Set to true to prevent indexing of this page */
    noIndex?: boolean;
}

const SITE_NAME = 'Renault';
const BASE_URL = 'https://app.renult.xyz';
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;
const DEFAULT_DESCRIPTION =
    'Renault is a MikroTik hotspot billing and voucher management platform for internet providers in Uganda.';
const DEFAULT_KEYWORDS =
    'MikroTik billing system, hotspot billing Uganda, WiFi voucher management, router monitoring, captive portal, internet billing software';

export default function SEO({
    title,
    description = DEFAULT_DESCRIPTION,
    keywords = DEFAULT_KEYWORDS,
    path = '/',
    ogImage = DEFAULT_OG_IMAGE,
    ogType = 'website',
    noIndex = false,
}: SEOProps) {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} – MikroTik Hotspot Billing System`;
    const canonicalUrl = `${BASE_URL}${path}`;

    return (
        <Helmet>
            {/* Primary SEO */}
            <title>{fullTitle}</title>
            <meta name="description" content={description} />
            <meta name="keywords" content={keywords} />
            <link rel="canonical" href={canonicalUrl} />
            {noIndex && <meta name="robots" content="noindex, nofollow" />}

            {/* Open Graph */}
            <meta property="og:type" content={ogType} />
            <meta property="og:site_name" content={SITE_NAME} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="og:image" content={ogImage} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:image:alt" content={fullTitle} />
            <meta property="og:locale" content="en_US" />

            {/* Twitter Card */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={ogImage} />
            <meta name="twitter:image:alt" content={fullTitle} />
        </Helmet>
    );
}
