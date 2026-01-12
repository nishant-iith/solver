import { NextRequest, NextResponse } from "next/server";
import { runSolveFlow } from "@/lib/solve-engine";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            platform = "leetcode",
            mode = "potd",
            leetcode_session,
            csrf_token,
            gemini_key: body_gemini_key,
            tg_token,
            tg_chat_id
        } = body;

        const gemini_key = body_gemini_key || process.env.GEMINI_API_KEY;
        if (!gemini_key) return NextResponse.json({ error: "Missing Gemini API Key" }, { status: 400 });

        if (platform !== "leetcode") {
            return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
        }

        if (!leetcode_session) return NextResponse.json({ error: "Missing LeetCode Session Cookie" }, { status: 400 });
        if (!csrf_token) return NextResponse.json({ error: "Missing CSRF Token" }, { status: 400 });

        const result = await runSolveFlow({
            leetcode_session,
            csrf_token,
            gemini_key,
            tg_token,
            tg_chat_id,
            mode
        });

        return NextResponse.json(result);

    } catch (error: any) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
