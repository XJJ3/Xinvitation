import { NextResponse } from "next/server";
import { saveGuestbookEntry, loadGuestbookEntries } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, message } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "请填写昵称" }, { status: 400 });
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "请填写祝福语" }, { status: 400 });
    }

    if (message.length > 500) {
      return NextResponse.json(
        { error: "祝福语不能超过 500 个字符" },
        { status: 400 }
      );
    }

    const record = await saveGuestbookEntry({ name, message });

    return NextResponse.json({ success: true, entry: record });
  } catch (error) {
    console.error("留言提交错误:", error);
    return NextResponse.json({ error: "提交失败,请稍后再试" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const entries = await loadGuestbookEntries();
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("获取留言错误:", error);
    return NextResponse.json({ error: "获取留言失败" }, { status: 500 });
  }
}
