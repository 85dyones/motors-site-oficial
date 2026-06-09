import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const companyPath = path.join(process.cwd(), "src/lib/companySettings.json");
const aboutPath = path.join(process.cwd(), "src/lib/aboutSettings.json");

export async function GET() {
  try {
    const companyRaw = await fs.readFile(companyPath, "utf-8");
    const aboutRaw = await fs.readFile(aboutPath, "utf-8");
    
    return NextResponse.json({
      companySettings: JSON.parse(companyRaw),
      aboutSettings: JSON.parse(aboutRaw),
    });
  } catch (error) {
    console.error("Failed to read settings files:", error);
    return NextResponse.json({ error: "Failed to read settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { companySettings, aboutSettings } = body;

    if (companySettings) {
      await fs.writeFile(companyPath, JSON.stringify(companySettings, null, 2), "utf-8");
    }

    if (aboutSettings) {
      await fs.writeFile(aboutPath, JSON.stringify(aboutSettings, null, 2), "utf-8");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to write settings files:", error);
    return NextResponse.json({ error: "Failed to write settings" }, { status: 500 });
  }
}
