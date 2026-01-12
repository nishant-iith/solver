import { generateSolution } from "./gemini";
import { getPOTD, getQuestionData, submitSolution, checkSubmission, getNextUnsolved, getCurrentUser } from "./leetcode";
import { getCFUnsolvedProblem, getCFProblemContent, submitCFSolution } from "./codeforces";
import { sendTelegramMessage } from "./telegram";

export interface SolveConfig {
    platform?: "leetcode" | "codeforces";
    leetcode_session?: string;
    csrf_token?: string;

    // Codeforces (optional)
    cf_handle?: string;
    cf_jsessionid?: string;
    cf_csrf_token?: string;

    gemini_key: string;
    tg_token?: string;
    tg_chat_id?: string;
    mode: "potd" | "next"; // For CF, "next" means random unsolved in range
}

export async function runSolveFlow(config: SolveConfig) {
    const {
        platform = "leetcode",
        gemini_key, tg_token, tg_chat_id, mode
    } = config;

    // ==========================================
    // CODEFORCES FLOW
    // ==========================================
    if (platform === "codeforces") {
        const { cf_handle, cf_jsessionid, cf_csrf_token } = config;

        if (!cf_handle || !cf_jsessionid || !cf_csrf_token) {
            throw new Error("Missing Codeforces credentials");
        }

        // 1. Find Unsolved Problem
        // Default range 800-1200 for now. Can be configurable later.
        const problem = await getCFUnsolvedProblem(cf_handle, 800, 1200);
        if (!problem) {
            return { status: "ALL_SOLVED", message: "No unsolved problems found in range!" };
        }

        const problemSource = `CF ${problem.contestId}${problem.index}: ${problem.name}`;

        // 2. Scrape Content
        const content = await getCFProblemContent(problem.contestId, problem.index);

        // 3. Generate Solution
        // Note: Codeforces C++ usually requires full template.
        // We will tell Gemini to be robust. 
        const solutionCode = await generateSolution(
            gemini_key,
            "C++ 20",
            content,
            "// Write full solution including main function"
        );

        // 4. Submit
        let submitResult = "Submitted";
        try {
            const submission = await submitCFSolution(cf_handle, problem, solutionCode, cf_jsessionid, cf_csrf_token);
            if (tg_token && tg_chat_id) {
                await sendTelegramMessage(tg_token, tg_chat_id,
                    `<b>✅ Codeforces Solved!</b>\n\n` +
                    `<b>Problem:</b> ${problem.contestId}${problem.index} - ${problem.name}\n` +
                    `<b>Stats:</b> Rating ${problem.rating || 800}\n` +
                    `<b>Status:</b> Submitted (Check Profile)`
                );
            }
        } catch (err: any) {
            console.error("CF Submit Error:", err.message);
            submitResult = "Manual Submission Required";

            if (tg_token && tg_chat_id) {
                await sendTelegramMessage(tg_token, tg_chat_id,
                    `<b>⚠️ Automatic Submission Blocked</b>\n\n` +
                    `Codeforces blocked the cloud IP. Here is the solution for manual submission:\n\n` +
                    `<b>Problem:</b> <a href="https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}">${problem.name}</a>`
                );
                // Send code in a separate message for easy copying
                await sendTelegramMessage(tg_token, tg_chat_id, `<pre language="cpp">${solutionCode}</pre>`);
            }
        }

        return {
            status: submitResult,
            problem: problem.name,
            source: "Codeforces",
            code: solutionCode
        };
    }

    // ==========================================
    // LEETCODE FLOW
    // ==========================================
    const { leetcode_session, csrf_token } = config;
    if (!leetcode_session || !csrf_token) throw new Error("Missing LeetCode credentials");

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
