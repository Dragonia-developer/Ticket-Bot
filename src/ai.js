async function generateAiReply(channel, ticket, category, config) {
  if (!config.ai?.enabled || config.ai?.provider !== 'openai') return null;
  if (!config.ai.apiKey || config.ai.apiKey === 'YOUR_OPENAI_API_KEY') return null;

  const { OpenAI } = require('openai');
  const client = new OpenAI({ apiKey: config.ai.apiKey });
  const messages = await channel.messages.fetch({ limit: config.ai.maxHistoryMessages || 12 });
  const history = [...messages.values()]
    .reverse()
    .filter((message) => !message.author.bot)
    .map((message) => `${message.author.username}: ${message.content || '[attachment]'}`)
    .join('\n');
  const styleName = category.aiStyle || config.ai.defaultStyle || 'friendly';
  const style = config.ai.styles?.[styleName] || config.ai.styles?.friendly || 'Be helpful and concise.';
  const response = await client.chat.completions.create({
    model: config.ai.model || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: [
          'You are a Discord support ticket assistant.',
          style,
          config.ai.safety || '',
          'Reply in English unless the user clearly writes another language.'
        ].filter(Boolean).join('\n')
      },
      {
        role: 'user',
        content: `Ticket category: ${ticket.categoryId}\nRecent conversation:\n${history}\n\nWrite the next useful support reply.`
      }
    ],
    temperature: 0.4,
    max_tokens: 450
  });
  return response.choices?.[0]?.message?.content?.trim() || null;
}

module.exports = {
  generateAiReply
};
