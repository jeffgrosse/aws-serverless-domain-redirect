# Architecture

## Overview

```
                        ┌─────────────────────┐
   dig A/AAAA           │   Route 53 zone      │  (BYO, not created here)
   sourcedomain.com ───▶│   apex + www alias    │
                        │   records             │
                        └──────────┬───────────┘
                                   │ alias
                                   ▼
                        ┌─────────────────────┐
   https://sourcedomain │   CloudFront          │  ACM cert (us-east-1)
   .com/anything    ───▶│   distribution        │◀─ apex + www SANs,
                        │   (PriceClass_100)    │   DNS-validated
                        └──────────┬───────────┘
                                   │ viewer-request
                                   ▼
                        ┌─────────────────────┐
                        │  CloudFront Function  │
                        │  redirect.js          │
                        │  -> 301 Location:     │
                        │     TargetUrl         │
                        └──────────┬───────────┘
                                   │ (function short-circuits
                                   │  the request; origin below
                                   │  is never actually fetched)
                                   ▼
                        ┌─────────────────────┐
                        │  dummy origin         │
                        │  example.com          │
                        └─────────────────────┘
```

Every request — any path, any query string, any method in {GET, HEAD} —
gets a `301 Moved Permanently` with `Location: TargetUrl` before CloudFront
ever contacts an origin. The origin block is required by the
`AWS::CloudFront::Distribution` schema even though it's never used, so it
points at `example.com` as an inert placeholder.

## Why a CloudFront Function instead of S3 or Lambda@Edge

**S3 static website redirect** (bucket configured with a website redirect
rule) is the more common pattern for this problem, and cheaper — no
CloudFront Function invocations at all if you skip CloudFront and use an S3
website endpoint directly. But an S3 website endpoint doesn't support HTTPS
on a custom domain by itself, so you'd still need CloudFront in front of it.
Once CloudFront is in the picture anyway, S3 is just an extra hop and an
extra resource (bucket, bucket policy, OAC) with nothing to redirect *from*
other than static config — the CloudFront Function approach removes that
resource entirely.

**Lambda@Edge** is the traditional way to run per-request logic at the edge.
It's heavier: functions replicate to every edge region as actual Lambda
executions, cold starts are possible, cost is higher (billed like Lambda:
per-request + per-100ms-of-compute), and deployment requires the function to
live in us-east-1 with an edge-replication step that isn't instantaneous. For
a static 301 with no per-request computation beyond returning a fixed
string, this is a lot of machinery.

**CloudFront Function** is purpose-built for exactly this: small,
synchronous, sub-millisecond JS at the edge, viewer-request/viewer-response
only (no origin-request/response, which we don't need), no cold starts, and
priced roughly an order of magnitude below Lambda@Edge per invocation. The
trade-off is a restricted JS runtime (no `require`, no async I/O, 10KB code
size limit, no network calls) — irrelevant here since the whole function is
one object literal.

## Parameterization

- `SourceDomain` / `TargetUrl` are free-form strings so the same template
  redirects any domain to any URL.
- `HostedZoneId` is BYO on purpose: creating a hosted zone in the template
  would mean CloudFormation owns your zone's lifecycle, and deleting the
  stack would delete your DNS zone along with it. Since domain registration
  and zone creation happen outside CloudFormation's control anyway (you
  can't `sam deploy` a domain purchase), it's more consistent to keep the
  zone itself out of the stack too.
- `IncludeWww` is a string (`'true'`/`'false'`) rather than a native
  CloudFormation boolean parameter type, because CloudFormation doesn't have
  one. The `ShouldIncludeWww` condition gates:
  - the cert's `SubjectAlternativeNames` / `DomainValidationOptions`,
  - the distribution's `Aliases`,
  - the two `www.*` Route 53 record sets (`Condition: ShouldIncludeWww`).

## Region lock

CloudFront requires the ACM certificate attached to a distribution to be
issued in `us-east-1`, regardless of which region the distribution's
metadata lives in (CloudFront distributions are technically global/no-region
resources, but the cert must come from `us-east-1`). Rather than adding a
nested stack or custom resource to create the cert cross-region from a stack
deployed elsewhere, this template requires the whole stack to be deployed in
`us-east-1` and enforces that with a template `Rules` block
(`MustDeployToUsEast1`) that fails the deployment immediately if the region
is wrong, rather than failing later and more confusingly at certificate
creation.

## Cache policy

The default cache behavior uses the AWS managed `CachingDisabled` policy
(`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`). Since the function computes the
same redirect on every request, caching would only save a trivial amount of
compute — and would mean that changing `TargetUrl` and redeploying wouldn't
take effect until either the cache TTL expired or you ran a manual
invalidation. Disabling caching keeps `TargetUrl` changes effective
immediately at the cost of one CloudFront Function invocation per request,
which is cheap enough not to matter for a redirect domain.
