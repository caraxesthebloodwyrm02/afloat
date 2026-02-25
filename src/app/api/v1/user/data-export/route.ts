import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import { getDataRightsRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { exportUserData } from "@/lib/data-layer";
import { writeAuditLog, hashIP, getClientIP } from "@/lib/audit";
import type { ApiError } from "@/types/api";

function jsonToCsv(data: Record<string, unknown>): string {
  const rows: string[][] = [];
  const flattenObj = (obj: unknown, prefix = ""): Record<string, string> => {
    const result: Record<string, string> = {};
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          Object.assign(result, flattenObj(value, fullKey));
        } else {
          result[fullKey] = String(value ?? "");
        }
      }
    }
    return result;
  };

  // Flatten user_profile and subscription_reference into a single row
  const profileFlat = flattenObj(data.user_profile, "user_profile");
  const subFlat = flattenObj(data.subscription_reference, "subscription");
  const merged = { ...profileFlat, ...subFlat };
  const headers = Object.keys(merged);
  rows.push(headers);
  rows.push(headers.map((h) => merged[h]));

  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

async function buildZipBuffer(jsonData: Record<string, unknown>): Promise<Buffer> {
  // Minimal ZIP file construction without external dependencies
  // Contains two files: data.json and data.csv
  const jsonBytes = Buffer.from(JSON.stringify(jsonData, null, 2), "utf-8");
  const csvBytes = Buffer.from(jsonToCsv(jsonData), "utf-8");

  const files = [
    { name: "data.json", data: jsonBytes },
    { name: "data.csv", data: csvBytes },
  ];

  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, "utf-8");
    const crc = crc32(file.data);

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // compression: stored
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14); // crc-32
    local.writeUInt32LE(file.data.length, 18); // compressed size
    local.writeUInt32LE(file.data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26); // filename length
    local.writeUInt16LE(0, 28); // extra field length
    nameBytes.copy(local, 30);

    parts.push(local, file.data);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    centralDir.push(central);
    offset += local.length + file.data.length;
  }

  const centralDirBuf = Buffer.concat(centralDir);
  const centralDirOffset = offset;

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralDirBuf, eocd]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;

  const rateLimitResponse = await checkRateLimit(
    getDataRightsRateLimiter(),
    user.user_id
  );
  if (rateLimitResponse) return rateLimitResponse;

  const data = await exportUserData(user.user_id);
  if (!data) {
    return NextResponse.json<ApiError>(
      { error: "not_found", message: "User not found." },
      { status: 404 }
    );
  }

  await writeAuditLog({
    actor: user.user_id,
    action: "export",
    resource_type: "user_profile",
    resource_id: user.user_id,
    outcome: "success",
    ip_hash: hashIP(getClientIP(request)),
    metadata: {
      format: request.nextUrl.searchParams.get("format") || "json",
    },
  });

  const format = request.nextUrl.searchParams.get("format");
  if (format === "portable") {
    const zipBuffer = await buildZipBuffer(data);
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="afloat-data-export-${user.user_id}.zip"`,
      },
    });
  }

  return NextResponse.json(data);
}
