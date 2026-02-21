# AWS Usage Tool (OpenClaw plugin)

Tool name: `aws_usage`

Actions:
- `profiles` → list local AWS profiles from `~/.aws/credentials` and `~/.aws/config`
- `current` → month-to-date total unblended cost
- `by_service` → month-to-date unblended cost grouped by AWS service

## Requirements
- AWS CLI installed and available in PATH
- Credentials configured in `~/.aws/credentials` (or env)
- IAM permission: `ce:GetCostAndUsage`

## Example calls
```json
{"action":"profiles"}
{"action":"current"}
{"action":"current","profile":"default","region":"us-east-1"}
{"action":"by_service","profile":"prod"}
```

## Enable plugin
Set in your config:
```json
{
  "plugins": {
    "entries": {
      "aws-usage-tool": { "enabled": true }
    }
  }
}
```

Then restart gateway.
