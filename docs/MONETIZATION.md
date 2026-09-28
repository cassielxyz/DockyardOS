# DockyardOS Partner & Sponsor Monetization

DockyardOS monetization is deliberately separated from technical decision-making.

A provider, tool, or service **must never rank higher because it pays DockyardOS**. Agent recommendations continue to use capability, compatibility, trust, security, availability, pricing/free-tier evidence, and project requirements. Sponsored/affiliate offers are displayed only in a separate `Partners` surface with explicit disclosure.

## Surfaces

### VS Code Community Hub

The Community Hub can display text-only sponsored/affiliate cards from `integrations/vscode/partner-offers.json`.

- no third-party ad JavaScript;
- no remote images;
- no tracking pixels;
- no hidden click tracking added by DockyardOS;
- every card is labeled `Sponsored / affiliate link`;
- partner cards are separate from packages, capability ranking, provider selection, and agent recommendations.

During guarded VSIX release packaging, `scripts/generate-partner-offers.cjs` builds this manifest from approved environment variables.

### Vercel partner feed

`api/partner-offers.js` provides a small public JSON feed using the same environment variables. This is intended for a future linked DockyardOS Vercel project so links can be changed centrally without exposing private credentials or shipping arbitrary remote HTML.

The endpoint returns only configured HTTPS affiliate URLs and fixed DockyardOS-owned descriptions. It never serializes environment variables wholesale.

### DockyardOS website/docs ads

Developer ad networks such as EthicalAds or Carbon/BuySellAds can be evaluated for a future public DockyardOS website/docs property. Their scripts are **not** injected into the VS Code extension.

## Recommended programs

Program terms change. Re-check the official program page before publishing a new campaign.

### 1. DigitalOcean Affiliate — strong fit

Official application:

- https://www.digitalocean.com/affiliates

DigitalOcean currently advertises a recurring affiliate commission model and routes affiliate enrollment through CJ. After approval, copy the approved affiliate/deep link from the affiliate dashboard.

Dockyard variable:

```text
DOCKYARD_PARTNER_DIGITALOCEAN_URL
```

DigitalOcean also has a separate referral-credit program:

- https://www.digitalocean.com/referral-program
- https://docs.digitalocean.com/platform/teams/how-to/refer-others/

The referral program earns DigitalOcean account credits rather than cash, so use the affiliate program when revenue is the goal.

### 2. Vercel Affiliate — excellent product fit when accepted

Current affiliate terms:

- https://vercel.com/legal/affiliate-marketing-terms

Vercel states that its affiliate link program is administered through Dub. General partnership/application routes:

- https://vercel.com/partners
- https://vercel.com/contact/partnerships

Do not rely on the older Vercel referral-credit system; that program was discontinued in 2026. Use only an affiliate link issued under a current accepted program.

Dockyard variable:

```text
DOCKYARD_PARTNER_VERCEL_URL
```

### 3. Namecheap Affiliate — strong domain/DNS fit

Official program:

- https://www.namecheap.com/affiliates/

Namecheap currently supports affiliate enrollment through Impact and CJ. Copy the approved tracked text/deep link from the network dashboard.

Dockyard variable:

```text
DOCKYARD_PARTNER_NAMECHEAP_URL
```

Useful publisher-network signups:

- Impact: https://impact.com/get-started/
- CJ: https://www.cj.com/join

### 4. Hostinger Affiliate — useful hosting fallback

Official program:

- https://www.hostinger.com/affiliates

After approval, copy the approved affiliate link from the Hostinger affiliate dashboard.

Dockyard variable:

```text
DOCKYARD_PARTNER_HOSTINGER_URL
```

Hostinger also documents referral/partner alternatives for publishers who do not yet meet the affiliate-program audience requirements.

### 5. EthicalAds — website/docs only

Publisher application:

- https://www.ethicalads.io/publishers/

EthicalAds is developer-focused and contextual/privacy-oriented. It currently evaluates developer-focused sites and asks applicants for site traffic/audience information. After approval, its public publisher identifier can be stored as:

```text
ETHICALADS_PUBLISHER_ID
```

Do not load EthicalAds JavaScript inside the VS Code extension. Use it only on an approved DockyardOS website/docs placement and follow its placement/exclusivity requirements.

### 6. Carbon / BuySellAds — website/docs only

Publisher information:

- https://www.carbonads.net/faq
- https://www.buysellads.com/publishers

Carbon is developer/design focused and currently invitation/review based. Its placement policy is exclusive on pages where Carbon appears. If approved, store the public zone key as:

```text
CARBONADS_ZONE_KEY
```

Do not inject Carbon scripts into the VS Code extension.

## GitHub Actions configuration

For release-time partner cards, add these under:

```text
GitHub repository
→ Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

Names:

```text
DOCKYARD_PARTNER_VERCEL_URL
DOCKYARD_PARTNER_DIGITALOCEAN_URL
DOCKYARD_PARTNER_NAMECHEAP_URL
DOCKYARD_PARTNER_HOSTINGER_URL
```

The guarded `.github/workflows/vscode-extension.yml` workflow maps these values only into the VSIX packaging step. Unset values are simply omitted from the generated offer manifest.

Important: an affiliate/referral URL is public once users can click it. Using GitHub Secrets prevents accidental source-code commits and centralizes release configuration, but it does **not** make the resulting affiliate URL confidential.

Never store account passwords, private API keys, payment credentials, or affiliate-dashboard login credentials in DockyardOS partner configuration.

## Vercel environment configuration

For the public `/api/partner-offers` endpoint, create the same four variables in the DockyardOS Vercel project:

```text
Project
→ Settings
→ Environment Variables
```

Recommended targets:

```text
Production
Preview
```

The API response contains only the public affiliate URL and fixed offer metadata. Vercel account/API tokens are not required by the feed itself.

If deployment is automated from CI, keep deployment credentials separate:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Those are deployment credentials and must never be returned by the partner feed or bundled into the VSIX.

## Local verification

Generate the manifest locally:

```bash
cd integrations/vscode
DOCKYARD_PARTNER_DIGITALOCEAN_URL='https://m.do.co/c/EXAMPLE' \
  npm run generate-partners
cat partner-offers.json
```

Then package:

```bash
npm run package -- --out dockyardos-vscode.vsix
```

Verify the manifest is present:

```bash
unzip -p dockyardos-vscode.vsix extension/partner-offers.json
```

Open the extension, run `DockyardOS: Open Community Hub`, and select the **Partners** tab. Every visible offer must be clearly labeled as sponsored/affiliate.

## Non-negotiable policy

DockyardOS partner revenue must never change:

- capability scoring;
- provider fallback order;
- free-tier/pricing evidence;
- security decisions;
- agent/subagent selection;
- installation trust decisions;
- approval requirements;
- search/research conclusions.

Sponsored inventory is a monetization surface, not an input to the autonomous decision engine.
