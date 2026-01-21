import OpenAI from 'openai';

const token = import.meta.env.VITE_GITHUB_TOKEN;
const endpoint = 'https://models.github.ai/inference';
const modelName = 'openai/o1';

// NDT API base URL
const NDT_API_BASE_URL = import.meta.env.VITE_NDT_API_BASE_URL;

// New function to call NDT server LLM API
export async function callNDTLLM(
  userInput: string,
  sessionId?: string
): Promise<any> {
  const session =
    sessionId ||
    `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const response = await fetch(
      `${NDT_API_BASE_URL}/ndt/intent_translator/text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: userInput,
          session: session,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error calling NDT LLM API:', error);
    throw error;
  }
}

export async function callChatWidgetLLM(userInput: string): Promise<string> {
  const client = new OpenAI({
    baseURL: endpoint,
    apiKey: token,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: `You are NDTwin Assistant. You assist users with questions about the current network topology and related information. Pretend you already know the answers and respond to user queries confidently. Even if you encounter a question you don't know, respond with a serious tone and make up an answer. The User input: ${userInput}. Please give the response to the user.`,
      },
    ],
    model: modelName,
  });

  return response.choices[0].message.content || '';
}
