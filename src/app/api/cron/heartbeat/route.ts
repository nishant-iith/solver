import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/leetcode";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

        const { data: accounts, error } = await supabase
            .from('automation_settings')
            .select('*')
            .eq('is_active', true);

        if (error || !accounts || accounts.length === 0) {
            return NextResponse.json({ message: "No active accounts to pulse." });
        }

        const results = [];
        for (const account of accounts) {
            try {
                const user = await getCurrentUser(account.leetcode_session, account.csrf_token);
                if (!user) {
                    await sendTelegramMessage(account.telegram_token, account.telegram_chat_id, "<b>⚠️ Session Expired!</b>\n\nYour LeetCode session has expired. Please refresh your cookies in the web app to keep automation running.");
                    results.push({ id: account.id, status: "Expired" });
                } else {
                    results.push({ id: account.id, status: "Healthy", username: user.username });
                }
            } catch (err) {
                results.push({ id: account.id, status: "Error", message: (err as Error).message });
            }
        }

        return NextResponse.json({ message: "Heartbeat Complete", results });

    } catch (err: any) {
        console.error(err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
