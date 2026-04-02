import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Prevent path traversal
  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "src/lib/agent-templates", id, "SKILL.md");

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return NextResponse.json({ id, content });
}
