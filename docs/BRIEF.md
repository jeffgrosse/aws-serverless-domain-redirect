Build public repo `aws-serverless-domain-redirect` locally. Do NOT deploy. Do NOT push to GitHub.

Reusable AWS SAM template: redirects any custom domain to any target URL over HTTPS using CloudFront + CloudFront Function + ACM + Route 53. Reference deployment: jeffgrosse.com → https://www.linkedin.com/in/jeffreygrosse/ but fully parameterized.

Architecture:
- BYO Route 53 hosted zone (parameter, do NOT create in template)
- ACM cert in us-east-1, DNS-validated via Route 53, covers apex + www
- CloudFront distribution, PriceClass_100, TLS 1.2, apex + www aliases
- CloudFront Function (viewer-request) returns 301 with Location header to TargetUrl
- Route 53 A + AAAA alias records for apex + www → CloudFront
- No S3, no Lambda@Edge, dummy origin (example.com)

Parameters: SourceDomain, TargetUrl, HostedZoneId, IncludeWww (default true).

Repo structure:
- README.md (what it does, CF Function vs S3/Lambda@Edge trade-offs, prereqs incl Namecheap NS swap, deploy steps, verify with dig + curl -I, ~$0.50/mo cost, sam delete cleanup, us-east-1 region lock)
- LICENSE (MIT, Jeff Grosse, 2026)
- template.yaml
- samconfig.toml.example
- src/redirect.js
- .gitignore (samconfig.toml, .aws-sam/, node_modules/, .DS_Store)
- docs/ARCHITECTURE.md

Constraints: no secrets, no ARNs, no account IDs committed. Clarity over cleverness. Stranger should be able to clone, create their own Route 53 zone, and `sam deploy --guided`.

Start by proposing directory structure and template.yaml skeleton. I'll review before you generate all files.
