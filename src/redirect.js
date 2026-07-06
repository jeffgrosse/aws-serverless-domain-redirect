// ============================================================================
// SYNC WARNING: This file is a reference copy, NOT what gets deployed.
// The deployed function code lives inline in template.yaml's RedirectFunction
// resource (FunctionCode property). If you change the logic here, you MUST
// change it there too -- CloudFormation does not read this file.
// ============================================================================
//
// CloudFront Functions have no environment variables and no support for
// loading code from S3/local files in CloudFormation, so the actual deployed
// code is inlined in template.yaml, with TargetUrl substituted in via
// Fn::Sub at deploy time. This file exists so the logic is readable and
// locally testable/lintable without parsing YAML.
//
// Example TargetUrl for local testing/linting purposes:
var TARGET_URL = 'https://www.linkedin.com/in/jeffreygrosse/';

function handler(event) {
    var response = {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: {
            location: { value: TARGET_URL }
        }
    };
    return response;
}
