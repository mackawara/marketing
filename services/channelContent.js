const config = require('../config');

// Rotation order. `news` topics need current, linked sources; the others are
// evergreen advice and must not carry invented links.
const TOPICS = [
  { key: 'wifi', label: 'Wi-Fi', emoji: '📡', news: false,
    brief: 'a practical Wi-Fi tip: coverage, router placement, signal strength, speed or troubleshooting' },
  { key: 'security', label: 'Security', emoji: '🔒', news: false,
    brief: 'a practical online/home-network security tip: passwords, scams, updates, router and CCTV hardening' },
  { key: 'whatsapp', label: 'WhatsApp tips', emoji: '💬', news: false,
    brief: 'a useful, accurate WhatsApp feature or privacy/safety tip' },
  { key: 'news', label: 'Tech news', emoji: '📰', news: true,
    brief: 'one significant technology news item from the last 7 days' },
  { key: 'ai', label: 'AI', emoji: '🤖', news: true,
    brief: 'one significant AI development from the last 7 days' },
];

const SYSTEM_PROMPT = `You write short posts for a WhatsApp Channel run by a local tech and networking business (Wi-Fi, CCTV, Starlink, LTE and general IT support).
Rules:
- Write 40-70 words: clear, friendly and practical, for non-experts.
- WhatsApp formatting only: *bold* for one short headline, no markdown headings, no tables, no hashtags.
- Start with the headline line, then the message. At most two emojis.
- Never invent facts, statistics, products or links. If you are unsure, leave it out.
- For news items: use web search, use only reliable, current sources (established news outlets, official vendor or government sites), report only what the source states, and end with a line "Source: <full URL>" using a URL you actually found.
- For tips: no links needed.`;

// Date + rotation index in the prompt nudges the model off yesterday's tip.
function buildUserPrompt(topic, rotationIndex, date) {
  return `Today is ${date}. Post number ${rotationIndex}. Topic: ${topic.label}. Write ${topic.brief}. Pick a different angle from the obvious one.`;
}

/** Topic for a rotation index: deterministic, so every topic is covered in turn. */
function topicFor(rotationIndex) {
  return TOPICS[((rotationIndex % TOPICS.length) + TOPICS.length) % TOPICS.length];
}

const URL_PATTERN = /https?:\/\/[^\s)>\]]+/g;

// web_search appends tracking params such as ?utm_source=openai.
function cleanUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

// Remove URLs but keep the rest of their line, then drop labels left dangling
// ("Source:") and tidy the whitespace.
function stripUrls(text) {
  return text
    .replace(URL_PATTERN, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/[ \t]+([.,;:!?])/g, '$1').trim())
    .filter((line) => line && !/^(sources?|read more|link)\s*:?\s*$/i.test(line))
    .join('\n');
}

function citedUrls(response) {
  const urls = [];
  for (const item of response.output || []) {
    for (const part of item.content || []) {
      for (const annotation of part.annotations || []) {
        if (annotation.type === 'url_citation' && annotation.url) urls.push(annotation.url);
      }
    }
  }
  return urls.map(cleanUrl).filter(Boolean);
}

/**
 * Generate one Channel post with the existing OpenAI client (services/openai.js).
 * News topics enable web search and are rejected unless a source link can be
 * included, so an unsourced news item is never published.
 * @returns {Promise<{text: string, topic: string, sources: string[]}>}
 */
async function generateChannelPost({ openai, rotationIndex, date, model = config.OPENAI_CHANNEL_MODEL }) {
  const topic = topicFor(rotationIndex);
  const request = {
    model,
    instructions: SYSTEM_PROMPT,
    input: buildUserPrompt(topic, rotationIndex, date),
    max_output_tokens: 500,
  };
  if (topic.news) request.tools = [{ type: 'web_search' }];

  const response = await openai.responses.create(request);
  // A response cut off by max_output_tokens (or failed) can still carry text.
  if (response.status && response.status !== 'completed') {
    const reason = response.incomplete_details?.reason || response.error?.message || response.status;
    throw new Error(`OpenAI response was ${response.status} (${reason}); not publishing partial text.`);
  }
  let text = String(response.output_text || '').trim();
  if (!text) throw new Error('OpenAI returned an empty Channel post.');

  // The model's own URLs are never trusted. Strip them (keeping the sentence
  // they sit in), then for news append a link taken from the web-search
  // citations only, so every published source was actually retrieved.
  text = stripUrls(text);
  if (!text) throw new Error('OpenAI returned no Channel post text besides links.');
  let sources = [];
  if (topic.news) {
    const [cited] = citedUrls(response);
    if (!cited) throw new Error(`No cited source link for ${topic.label} post; not publishing unsourced news.`);
    text = `${text}\n\nSource: ${cited}`;
    sources = [cited];
  }
  return { text: `${topic.emoji} ${text}`, topic: topic.key, sources };
}

module.exports = { TOPICS, SYSTEM_PROMPT, topicFor, generateChannelPost, buildUserPrompt };
