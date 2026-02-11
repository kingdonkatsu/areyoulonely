/**
 * Utility to check if text is appropriate using Groq API.
 */
export async function checkModeration(text) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;

    if (!apiKey) {
        console.warn('[Moderation] No API key found. Skipping check.');
        return true;
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a content moderator. Analyze the user text and respond with ONLY "TRUE" if the content is appropriate for a public space (no hate speech, explicit content, or severe toxicity) and "FALSE" if it is inappropriate. No other words.'
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                temperature: 0,
                max_tokens: 10
            })
        });

        const data = await response.json();
        const result = data.choices[0].message.content.trim().toUpperCase();
        console.log('[Moderation] Result:', result);
        return result.includes('TRUE');
    } catch (err) {
        console.error('[Moderation] API error:', err);
        // In case of error, we default to true to not block the user, 
        // but ideally we'd handle this more strictly.
        return true;
    }
}
