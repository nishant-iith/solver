export async function sendTelegramMessage(token: string, chatId: string, message: string) {
    if (!token || !chatId) return;

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: "HTML"
            })
        });

        if (!res.ok) {
            console.error("Telegram Notification Failed:", await res.text());
        }
    } catch (error) {
        console.error("Telegram Notification Error:", error);
    }
}
