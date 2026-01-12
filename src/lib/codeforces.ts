export async function getCFUserInfo(handle: string) {
    const res = await fetch(`https://codeforces.com/api/user.info?handles=${handle}`);
    const data = await res.json();
    if (data.status !== "OK") throw new Error(data.comment || "User not found");
    return data.result[0];
}

export async function getCFUnsolvedProblem(handle: string, minRating: number = 800, maxRating: number = 1200) {
    // 1. Get user status to find solved problems
    const statusRes = await fetch(`https://codeforces.com/api/user.status?handle=${handle}&from=1&count=1000`);
    const statusData = await statusRes.json();
    const solvedSet = new Set();
    if (statusData.status === "OK") {
        statusData.result.forEach((sub: any) => {
            if (sub.verdict === "OK") {
                solvedSet.add(`${sub.problem.contestId}${sub.problem.index}`);
            }
        });
    }

    // 2. Get problemset
    const probRes = await fetch("https://codeforces.com/api/problemset.problems");
    const probData = await probRes.json();
    if (probData.status !== "OK") throw new Error("Could not fetch problems");

    // 3. Filter for unsolved and rating within the specified range
    const allProblems = probData.result.problems;
    const candidates = allProblems.filter((prob: any) => {
        const id = `${prob.contestId}${prob.index}`;
        const probRating = prob.rating || 800;
        return !solvedSet.has(id) && probRating >= minRating && probRating <= maxRating;
    });

    if (candidates.length === 0) return null;

    // 4. Return a random candidate
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
}

export async function getCFProblemContent(contestId: number, index: string) {
    const url = `https://codeforces.com/problemset/problem/${contestId}/${index}`;
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
    });
    const html = await res.text();

    // Simple extraction of the problem statement
    const startIdx = html.indexOf('<div class="problem-statement">');
    const endIdx = html.indexOf('<div class="sample-tests">');

    if (startIdx === -1) {
        return "Could not extract problem statement automatically. Please see the URL.";
    }

    let content = html.substring(startIdx, endIdx);
    content = content.replace(/<[^>]*>?/gm, '');
    return content.trim();
}

export async function submitCFSolution(
    handle: string,
    problem: any,
    code: string,
    jsessionid: string,
    csrf_token: string
) {
    // Generate random ftaa
    const ftaa = Array.from({ length: 18 }, () => Math.floor(Math.random() * 36).toString(36)).join('');

    const body = new URLSearchParams();
    body.append("csrf_token", csrf_token);
    body.append("ftaa", ftaa);
    body.append("bfaa", "f1a7b8e9"); // constant often used
    body.append("action", "submitSolution");
    body.append("submittedProblemIndex", problem.index);
    body.append("contestId", problem.contestId.toString());
    body.append("programTypeId", "54"); // C++20 (MSVC 2022)
    body.append("source", code);
    body.append("tabSize", "4");
    body.append("_tta", "176"); // Tracking

    // 1. Pre-validation: Check if session is alive
    const checkRes = await fetch("https://codeforces.com/settings/general", {
        headers: {
            "Cookie": `JSESSIONID=${jsessionid}; 39ce7=${csrf_token}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }
    });

    if (checkRes.url.includes("login") || checkRes.status === 403) {
        throw new Error("CF Session Invalid! Codeforces likely blocked this IP. Session cookies are often IP-locked.");
    }

    const res = await fetch(`https://codeforces.com/problemset/submit?csrf_token=${csrf_token}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": `JSESSIONID=${jsessionid}; 39ce7=${csrf_token}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Origin": "https://codeforces.com",
            "Referer": `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`,
        },
        body: body.toString()
    });

    if (res.status === 302 || res.status === 200) {
        // If 302 redirect to my submissions, success.
        // If 200, might be validation error on page.
        const text = await res.text();
        if (text.includes("Source code is too short") || text.includes("error")) {
            throw new Error("Submission Rejected (Logic/Validation Error)");
        }
        return { status: "Success", message: "Check your CF status page!" };
    }

    // Try to get more info from error body
    const text = await res.text();
    console.log("CF Error Body:", text.substring(0, 200));

    throw new Error(`CF Submission Failed: ${res.statusText} (${res.status})`);
}
