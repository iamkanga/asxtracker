
// ===============================================================
// ================== GEMINI AI INTEGRATION ======================
// ===============================================================

/**
 * Handles the 'generateBriefing' action.
 * Generates a natural language daily briefing based on the user's portfolio context.
 * 
 * Payload expected:
 * {
 *   action: 'generateBriefing',
 *   userId: '...',
 *   context: {
 *      portfolio: { ... },
 *      topMovers: [ ... ],
 *      sentiment: '...' 
 *   }
 * }
 */
function handleGenerateBriefing_(payload) {
    try {
        const context = payload.context;
        if (!context) return { ok: false, error: 'Missing context' };

        // 1. Construct Prompt
        const p = context.portfolio || {};
        const prompt = `
You are a witty, professional financial analyst for the "ASX Tracker" app. 
Write a ONE-paragraph (max 3 sentences) daily briefing for the user based on their portfolio performance today.

Portfolio Stats:
- Day Change: ${p.dayChangePercent}% (${p.dayChangeValue})
- Total Value: ${p.totalValue}
- Key Winners: ${JSON.stringify(p.winners || [])}
- Key Losers: ${JSON.stringify(p.losers || [])}
- Market Sentiment: ${context.sentiment}

Tone:
- If up > 1%: Enthusiastic, congratulatory.
- If down > 1%: Empathetic, "hang in there".
- If flat: Calm, "steady as she goes".
- Use emojis sparingly.
- Focus on the "Why" if possible (e.g. "BHP dragged you down" or "Tech sector rally helped").
- Do NOT output markdown or bold text, just plain text.
    `;

        // 2. Call Gemini
        const text = callGeminiAPI_(prompt);
        return { ok: true, text: text };

    } catch (e) {
        Logger.log('[Gemini] Error: ' + e);
        return { ok: false, error: String(e) };
    }
}

/**
 * Calls Gemini 1.5 Flash via REST API.
 * Requires 'GEMINI_API_KEY' in Script Properties.
 */
function callGeminiAPI_(promptText) {
    const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!key) throw new Error('GEMINI_API_KEY not set in Script Properties');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

    const payload = {
        contents: [{
            parts: [{ text: promptText }]
        }],
        generationConfig: {
            maxOutputTokens: 150,
            temperature: 0.7
        }
    };

    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    const resp = UrlFetchApp.fetch(url, options);
    const start = Date.now();

    if (resp.getResponseCode() !== 200) {
        throw new Error(`Gemini API Error (${resp.getResponseCode()}): ${resp.getContentText()}`);
    }

    const data = JSON.parse(resp.getContentText());
    const choice = data.candidates && data.candidates[0];
    const text = choice && choice.content && choice.content.parts && choice.content.parts[0] && choice.content.parts[0].text;

    console.log(`[Gemini] Call took ${Date.now() - start}ms. Response len: ${text ? text.length : 0}`);
    return text ? text.trim() : 'AI was speechless.';
}

