import { GoogleGenerativeAI } from "@google/generative-ai";

export async function generateSolution(
    apiKey: string,
    language: string,
    problemDescription: string,
    codeSnippet: string,
    isCodeforces: boolean = false
) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = "gemini-3-flash-preview";

    let prompt = "";
    if (isCodeforces) {
        prompt = `
You are an expert competitive programmer.
Write a complete, optimized solution for the following Codeforces problem.
The solution MUST follow this exact C++ template:

#include<bits/stdc++.h>
using namespace std;

typedef long long ll;
typedef pair<int, int> pii;
typedef vector<int> vi;
typedef map<int, int> mii;

#define pb push_back
#define all(x) (x).begin(),(x).end()
#define loop(i, a, b) for(int i=a; i<b; i++)
#define rloop(i, a, b) for(int i=a-1; i>=b; i--)

class Helper {
protected:
    vi arrayInput(){
        int n;
        cin>>n;
        vi arr(n);
        loop(i, 0, n) cin>>arr[i];
        return arr;
    }
    vi arrayInput(int n){
        vi arr(n);
        loop(i, 0, n) cin>>arr[i];
        return arr;
    }
    string stringInput(){
        string s;
        cin>>s;
        return s;
    }
    void printArray(const vi &arr){
        for(int i=0; i<arr.size(); i++){
            cout<<arr[i]<<" ";
        }
        cout<<endl;
    }
};

class Solution : public Helper {
public:
    void solve(){
        // Your code here
    }
};

int main(){
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int t;
    if (cin >> t) {
        while(t--){
            Solution sol;
            sol.solve();
        }
    }
    return 0;
}

Output ONLY the code. Do NOT include any markdown formatting, explanations, or comments in the final code output.

Problem:
${problemDescription}

Your Solution:
`;
    } else {
        prompt = `
You are an expert competitive programmer.
Write a complete, optimized solution for the following LeetCode problem in ${language}.
The solution typically involves completing a class method.
Output ONLY the code that should go inside the solution editor. Do not include markdown formatting or explanations unless they are comments within the code.

Problem:
${problemDescription}

Code Snippet:
${codeSnippet}

Your Solution:
`;
    }

    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Clean up markdown code blocks if present
        if (text.startsWith("```")) {
            text = text.replace(/^```[a-z]*\n/, "").replace(/\n```$/, "");
        }

        return text.trim();
    } catch (error: any) {
        console.error("Gemini SDK Error:", error);
        throw error;
    }
}
