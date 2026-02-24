import { spawn } from "node:child_process";

type Params = {
  action: "current" | "by_service" | "profiles";
  profile?: string;
};

function parseProfiles(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function monthToDatePeriod() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return { start: `${yyyy}-${mm}-01`, end: `${yyyy}-${mm}-${dd}` };
}

function runAws(args: string[], envExtras: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("aws", args, {
      shell: process.platform === "win32",
      env: { ...process.env, ...envExtras },
    });

    const timeout = setTimeout(() => {
      p.kill();
      reject(new Error("AWS CLI command timed out after 30000ms."));
    }, 30000);

    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += String(d)));
    p.stderr.on("data", (d) => (stderr += String(d)));
    p.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    p.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else reject(new Error((stderr || `aws exited with code ${code}`).trim()));
    });
  });
}

function normalizeAwsError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Unable to locate credentials|Unable to load credentials|NoCredentialProviders/i.test(msg)) {
    return "AWS credentials not found. Run 'aws configure' or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.";
  }
  if (/could not be found|The config profile .* could not be found|profile .* not found/i.test(msg)) {
    return "AWS profile not found. Run 'aws configure --profile <name>' or check available profiles with 'aws configure list-profiles'.";
  }
  if (/AccessDenied|not authorized|UnauthorizedOperation/i.test(msg)) {
    return "Access denied. Need ce:GetCostAndUsage permission.";
  }
  if (/command not found|is not recognized|ENOENT/i.test(msg)) {
    return "AWS CLI not installed or not in PATH.";
  }
  return msg;
}

async function queryCost(action: "current" | "by_service", profile?: string) {
  const period = monthToDatePeriod();
  const args = [
    "ce",
    "get-cost-and-usage",
    "--time-period",
    `Start=${period.start},End=${period.end}`,
    "--granularity",
    "MONTHLY",
    "--metrics",
    "UnblendedCost",
    "--region",
    "us-east-1",
    "--output",
    "json",
  ];

  if (action === "by_service") {
    args.push("--group-by", "Type=DIMENSION,Key=SERVICE");
  }
  if (profile) args.push("--profile", profile);

  const raw = await runAws(args);

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON returned by AWS CLI.");
  }

  const row = data?.ResultsByTime?.[0] ?? {};
  const total = row?.Total?.UnblendedCost ?? {};

  if (action === "current") {
    return {
      ok: true,
      action,
      period,
      profile: profile ?? "default",
      total: Number.parseFloat(total?.Amount ?? "0").toFixed(2),
      currency: total?.Unit ?? "USD",
    };
  }

  const services: Record<string, { cost: string; currency: string }> = {};
  for (const g of row?.Groups ?? []) {
    const name = g?.Keys?.[0] ?? "Unknown";
    const c = g?.Metrics?.UnblendedCost;
    services[name] = {
      cost: Number.parseFloat(c?.Amount ?? "0").toFixed(2),
      currency: c?.Unit ?? "USD",
    };
  }

  return {
    ok: true,
    action,
    period,
    profile: profile ?? "default",
    services,
  };
}

export default function register(api: any) {
  api.registerTool(
    {
      name: "aws_usage",
      description: "Fetch AWS month-to-date cost usage and list local AWS profiles via AWS Cost Explorer.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["current", "by_service", "profiles"] },
          profile: { type: "string" },
        },
        required: ["action"],
      },
      async execute(_id: string, params: Params) {
        try {
          if (params.action === "profiles") {
            const out = await runAws(["configure", "list-profiles"]);
            const profiles = parseProfiles(out);
            return {
              content: [{ type: "text", text: JSON.stringify({ ok: true, action: "profiles", profiles }) }],
            };
          }

          const result = await queryCost(params.action, params.profile);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: false,
                  action: params.action,
                  profile: params.profile ?? "default",
                  error: normalizeAwsError(err),
                }),
              },
            ],
          };
        }
      },
    },
    { optional: true },
  );
}
