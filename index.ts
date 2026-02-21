import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

type Params = {
  action: "current" | "by_service" | "profiles";
  profile?: string;
  region?: string;
};

function awsFile(name: string) {
  return path.join(os.homedir(), ".aws", name);
}

function getRegionForProfile(profile?: string): string | undefined {
  const cfg = awsFile("config");
  if (!fs.existsSync(cfg)) return undefined;

  const txt = fs.readFileSync(cfg, "utf8");

  // AWS config uses:
  // [default]
  // [profile name]
  const section = profile && profile !== "default"
    ? `profile ${profile}`
    : "default";

  const re = new RegExp(`\\[${section}\\][^\\[]*?region\\s*=\\s*([^\\n]+)`, "i");
  const m = txt.match(re);
  return m?.[1]?.trim();
}

function listProfiles(): string[] {
  const out = new Set<string>();
  const files = [awsFile("credentials"), awsFile("config")];
  const re = /^\[(?:profile\s+)?([^\]]+)\]/gm;
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const txt = fs.readFileSync(f, "utf8");
    for (const m of txt.matchAll(re)) out.add(m[1].trim());
  }
  return [...out].sort();
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

    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += String(d)));
    p.stderr.on("data", (d) => (stderr += String(d)));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error((stderr || `aws exited with code ${code}`).trim()));
    });
  });
}

function normalizeAwsError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Unable to locate credentials/i.test(msg)) return "AWS credentials not found (~/.aws/credentials).";
  if (/could not be found|The config profile .* could not be found/i.test(msg)) return "AWS profile not found.";
  if (/AccessDenied|not authorized|UnauthorizedOperation/i.test(msg)) return "Access denied. Need ce:GetCostAndUsage permission.";
  if (/command not found|is not recognized/i.test(msg)) return "AWS CLI not installed or not in PATH.";
  return msg;
}

async function queryCost(action: "current" | "by_service", profile?: string, region = "us-east-1") {
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
    region,
    "--output",
    "json",
  ];
  if (action === "by_service") {
    args.push("--group-by", "Type=DIMENSION,Key=SERVICE");
  }
  if (profile) args.push("--profile", profile);

  const raw = await runAws(args);
  const data = JSON.parse(raw);
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
          region: { type: "string", default: "us-east-1" },
        },
        required: ["action"],
      },
      async execute(_id: string, params: Params) {
        try {
          if (params.action === "profiles") {
            const profiles = listProfiles();
            return {
              content: [
                { type: "text", text: JSON.stringify({ ok: true, action: "profiles", profiles }) },
              ],
            };
          }

    const profileRegion = getRegionForProfile(params.profile);
    const resolvedRegion = params.region || profileRegion || "us-east-1";

    // Cost Explorer is global → always us-east-1
    const CE_REGION = "us-east-1";

    const result = await queryCost(params.action, params.profile, CE_REGION);

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
