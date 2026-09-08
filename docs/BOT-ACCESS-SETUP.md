# Bot Access Setup — one-time checklist

## 1. GitHub: add the deploy key (permanent, no expiry)

1. Sign in as **toolbots-xyz** → github.com
2. Avatar → **Your repositories** → **New repository**
   - Repository name: **`toolbots.xyz`**
   - Visibility: **Public** (required for free Pages on personal accounts)
   - Do NOT initialize with README/license (repo already has them)
   - → **Create repository**
3. Still signed in: avatar → **Settings** → **SSH and GPG keys** → **New SSH key**
   - Title: `toolbots-site-ops (Hermes bot, this Mac)`
   - Key type: **Authentication Key**
   - Key: paste the ed25519 public key below → **Add key**

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAdNJU+/01wGbf7uf/uTZP9B48mB7GdGcN/fWpnOO01e hermes@toolbots.xyz (toolbots site ops)
```

The key lives only on this Mac (~/.ssh/toolbots_deploy). No expiry, scoped to
nothing but this machine. Revoke anytime via the same settings page.

## 2. Google Workspace: close the mail-auth gaps

Verified live 2026-09-07: MX (smtp.google.com) ✓ · site-verification TXT ✓ ·
DKIM (google._domainkey) ✓ — but **SPF missing** and **DMARC missing**.

Add at the DNS host (currently DreamHost, or Cloudflare after the cutover):

| Type | Name | Value |
|------|------|-------|
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:hermes@toolbots.xyz; adkim=s; aspf=s; pct=100` |

(SPF is safe to add immediately — it only affects outbound authentication.
DMARC `p=quarantine` is safe once SPF+DKIM are confirmed passing; if any
legitimate mail flow breaks, drop to `p=none` while debugging.)

Google references:
- SPF: https://support.google.com/a/answer/33786
- DMARC: https://support.google.com/a/answer/2466580

## 3. Gmail: send as hermes@toolbots.xyz

1. In the Gmail account: gear → **See all settings** → **Accounts** tab
2. **Send mail as** → **Add another email address** → `hermes@toolbots.xyz`
3. Uncheck "treat as alias" if you want separate identities (optional)
4. SMTP: **smtp.google.com**, port **587**, STARTTLS, your Workspace credentials
5. Google sends a confirmation code to hermes@toolbots.xyz — click/enter it

## 4. When done

Tell the chief-of-staff bot "keys are in". It will:
- `ssh -T git@github-toolbots` (handshake test)
- create + push: repo toolbots-xyz/toolbots.xyz ← 4 commits on main
- configure Pages via API, wait for the first Actions deploy
- verify https://toolbots-xyz.github.io/toolbots.xyz/ end-to-end
