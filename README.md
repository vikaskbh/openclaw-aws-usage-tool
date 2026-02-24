# AWS Usage Tool (OpenClaw plugin)

**Tool name:** `aws_usage`

## Actions

- `profiles` → List local AWS profiles from `~/.aws/credentials` and `~/.aws/config`
- `current` → Month-to-date total unblended cost
- `by_service` → Month-to-date unblended cost grouped by AWS service

---

## Requirements

- AWS CLI installed and available in `PATH`
- Credentials configured in `~/.aws/credentials` (or environment variables)
- IAM permission: `ce:GetCostAndUsage`

---

## Installation

### 1. Clone the plugin repo

```bash
git clone https://github.com/vikaskbh/openclaw-aws-usage-tool.git
```

---

### 2. Copy plugin files into OpenClaw extensions directory

OpenClaw looks for local plugins under:

- **Linux/macOS:** `~/.openclaw/workspace/.openclaw/extensions/`
- **Windows:** `%USERPROFILE%\.openclaw\workspace\.openclaw\extensions\`

Create target folder:

```
aws-usage-tool
```

So final path should be:

- **Linux/macOS:**  
  `~/.openclaw/workspace/.openclaw/extensions/aws-usage-tool/`

- **Windows:**  
  `%USERPROFILE%\.openclaw\workspace\.openclaw\extensions\aws-usage-tool\`

Copy these files into that folder:

- `index.ts`
- `openclaw.plugin.json`
- `README.md` (optional but recommended)

---

### 3. Enable plugin in OpenClaw config

Add or update in your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "aws-usage-tool": {
        "enabled": true
      }
    }
  }
}
```

**Optional hardening (allow-list only):**

```json
{
  "plugins": {
    "allow": ["aws-usage-tool"]
  }
}
```

---

### 4. Restart OpenClaw gateway

```bash
openclaw gateway restart
```

If running from source repo:

```bash
pnpm openclaw gateway restart
```

---

### 5. Verify tool is available

Call:

```json
{"action":"profiles"}
{"action":"current","profile":"default"}
{"action":"by_service","profile":"default"}
```

---

### 6. Configure AWS credentials (if needed)

```bash
aws configure
```

This sets up credentials/profile used by the tool.  
Required IAM permission: `ce:GetCostAndUsage`.

---

## Example calls

```json
{"action":"profiles"}
{"action":"current"}
{"action":"current","profile":"default","region":"us-east-1"}
{"action":"by_service","profile":"prod"}
```

---

## Enable plugin (quick reference)

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