# aws-serverless-domain-redirect

A reusable AWS SAM template that redirects a custom domain (apex + optional
`www`) to any target URL over HTTPS, using CloudFront + a CloudFront
Function + ACM + Route 53. No S3 bucket, no Lambda@Edge, no servers.

Reference deployment: [jeffgrosse.com](https://jeffgrosse.com) → [https://www.linkedin.com/in/jeffreygrosse/](https://www.linkedin.com/in/jeffreygrosse/).
The template itself is fully parameterized — clone it and point it at your
own domain and target.

Caching is intentionally disabled on the distribution (`CachingDisabled`
managed policy): a redirect target is expected to change occasionally, and
with caching off, updating `TargetUrl` and redeploying takes effect
immediately instead of waiting out a cache TTL or requiring a manual
invalidation.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the diagram, the
CloudFront Function vs. S3/Lambda@Edge trade-off discussion, and the
reasoning behind each parameter and condition.

## Prerequisites

- An AWS account, and the AWS SAM CLI installed
  (`sam --version`; see [AWS's install docs](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)).
- A domain you own, with an existing **Route 53 public hosted zone** for it.
  This template does not create the hosted zone — bring your own.
  - If your domain is registered elsewhere (e.g. Namecheap) and you're
    creating the hosted zone in Route 53 for the first time: create the
    hosted zone first, note the four NS records Route 53 gives you, then log
    into your registrar (Namecheap, etc.) and replace its default
    nameservers with those four. NS propagation can take anywhere from
    minutes to ~48 hours. ACM's DNS validation (below) will not succeed
    until the NS swap has propagated.
  - If the zone is already delegated to Route 53, skip this step.

## Validate the template

Before running `sam deploy` (or before tagging a release if you've forked
this), lint the template:

```bash
tests/validate.sh
```

This runs `sam validate --lint` against `template.yaml`. It does not
require AWS credentials and does not create or modify any resources.

## Deploy

This template must be deployed to **us-east-1**. CloudFront only accepts ACM
certificates issued in `us-east-1`, and this template creates the
certificate in whatever region you deploy the stack to — deploying elsewhere
will fail fast against a template `Rules` check rather than failing later
during certificate creation.

```bash
sam build
sam deploy --guided
```

`--guided` will prompt for:

| Parameter | Example |
|---|---|
| `SourceDomain` | `jeffgrosse.com` |
| `TargetUrl` | `https://www.linkedin.com/in/jeffreygrosse/` |
| `HostedZoneId` | `Z0123456789ABCDEFGHIJ` (find via `aws route53 list-hosted-zones`) |
| `IncludeWww` | `true` |

`SourceDomain` and `TargetUrl` may not contain single quotes (`'`) or dollar
signs (`$`). Both values are spliced verbatim into the CloudFront Function's
JavaScript source via CloudFormation's `Fn::Sub` (see `template.yaml`): a
single quote would break out of the function's string literal, and a `$`
(as in `${...}`) would be misread as an `Fn::Sub` variable reference. No
valid HTTPS domain or redirect target needs either character. A rejected
character fails CloudFormation's parameter validation with a clear error
before deploy, rather than deploying and then failing at the CloudFront
Function's JavaScript syntax check with an opaque error.

Confirm the region prompt is `us-east-1`. Answers are saved to
`samconfig.toml` (gitignored — see `samconfig.toml.example` for the format if
you'd rather write it by hand and skip `--guided` on subsequent deploys).

The stack takes a few minutes, mostly waiting on ACM DNS validation and
CloudFront distribution propagation.

## Verify the deployment

(For template linting before you deploy, see "Validate the template" above.)

Once the stack is `CREATE_COMPLETE`:

```bash
# DNS: confirm the apex and www resolve to a CloudFront edge
dig +short sourcedomain.com
dig +short www.sourcedomain.com

# HTTP: confirm the redirect and its target
curl -I https://sourcedomain.com
curl -I https://www.sourcedomain.com
```

You should see `HTTP/2 301` with a `location:` header set to your
`TargetUrl`. If DNS hasn't propagated yet but you want to confirm the
distribution itself is working, `curl -I` the `DistributionDomainName` stack
output directly (e.g. `https://d123abcxyz.cloudfront.net`) — the function
redirects on every request regardless of which alias it arrived on.

## Cost

Roughly **$0.50/month** for a low-traffic redirect domain:

- Route 53 hosted zone: $0.50/month (if you don't already have one for other
  records in this zone).
- CloudFront: PriceClass_100 data transfer/requests — a personal redirect
  domain sees negligible traffic, effectively free under the always-free
  tier or a few cents.
- CloudFront Function invocations: $0.10 per million — negligible at
  personal-domain volume.
- ACM certificate: free.

If you already have a Route 53 hosted zone for this domain (e.g. it also
hosts email records), this stack adds close to nothing to your bill.

## Cleanup

```bash
sam delete
```

This removes the CloudFront distribution, function, ACM certificate, and the
four Route 53 record sets this stack created. It does **not** delete the
Route 53 hosted zone itself (BYO, not owned by this stack).

## Security / repo hygiene

No secrets, ARNs, or account IDs are committed. `samconfig.toml` (which
would contain your real `HostedZoneId` and domain names) is gitignored —
`samconfig.toml.example` shows the format with placeholder values.
