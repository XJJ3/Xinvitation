import { NextResponse } from "next/server";
import { saveRsvp } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, attending, guests, message } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "请填写姓名" }, { status: 400 });
    }

    if (attending !== "yes" && attending !== "no") {
      return NextResponse.json({ error: "请选择是否出席" }, { status: 400 });
    }

    const record = await saveRsvp({
      name,
      email: typeof email === "string" ? email : undefined,
      attending,
      guests: typeof guests === "string" ? guests : "1",
      message: typeof message === "string" ? message : undefined,
    });

    return NextResponse.json({
      success: true,
      message: "已收到您的回执,期待与您相见。",
      id: record.id,
    });
  } catch (error) {
    console.error("RSVP 提交错误:", error);
    return NextResponse.json({ error: "提交失败,请稍后再试" }, { status: 500 });
  }
}
