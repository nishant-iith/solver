import { generateSolution } from "./gemini";
import { getPOTD, getQuestionData, submitSolution, checkSubmission, getNextUnsolved } from "./leetcode";
import { sendTelegramMessage } from "./telegram";

export interface SolveConfig {
    leetcode_session: string;
    csrf_token: string;
    gemini_key: string;
    tg_token?: string;
    tg_chat_id?: string;
    mode: "potd" | "next";
}

export async function runSolveFlow(config: SolveConfig) {
    const { leetcode_session, csrf_token, gemini_key, tg_token, tg_chat_id, mode } = config;

    let questionSlug = "";
    let problemSource = "";

    if (mode === "next") {
        const nextProb = await getNextUnsolved(leetcode_session, csrf_token);
        if (!nextProb) {
            return { status: "ALL_SOLVED", message: "All problems solved!" };
        }
        questionSlug = nextProb.titleSlug;
        problemSource = "Solve Next";
    } else {
        const potd = await getPOTD(leetcode_session, csrf_token);
        if (potd.userStatus === "Finish") {
            return { status: "ALREADY_SOLVED", message: "POTD already solved!" };
        }
        questionSlug = potd.question.titleSlug;
        problemSource = "POTD";
    }

    const qData = await getQuestionData(questionSlug);
    const validLangs = ["cpp", "python3", "java", "javascript"];
    const snippet = qData.codeSnippets.find((s: any) => validLangs.includes(s.langSlug));

    if (!snippet) {
        throw new Error("No supported language found for this problem.");
    }

    const solutionCode = await generateSolution(
        gemini_key,
        snippet.lang,
        qData.content,
        snippet.code
    );

    const submission = await submitSolution(
        leetcode_session,
        csrf_token,
        qData.questionId,
        snippet.langSlug,
        solutionCode,
        questionSlug
    );

    if (!submission.submission_id) {
        if (tg_token && tg_chat_id) {
            await sendTelegramMessage(tg_token, tg_chat_id, `<b>❌ LeetCode Submission Failed!</b>\n\nProblem: ${problemSource}\nPlease check your session cookies.`);
        }
        throw new Error("Submission failed: " + JSON.stringify(submission));
    }

    const result = await checkSubmission(submission.submission_id, leetcode_session, csrf_token);

    if (tg_token && tg_chat_id) {
        // Simple notification as requested: Title + Number + Status
        // qData.questionFrontendId is the problem number
        const problemNumber = qData.questionFrontendId || "?";

        await sendTelegramMessage(tg_token, tg_chat_id,
            `<b>✅ LeetCode Solved!</b>\n\n` +
            `<b>Problem:</b> ${problemNumber}. ${qData.title}\n` +
            `<b>Status:</b> ${result.state || 'Accepted'}`
        );
    }

    return {
        status: "Submitted",
        submission_result: result,
        problem: qData.title,
        source: problemSource,
        code: solutionCode
    };
}
