// Fetches messages from a Discord channel and writes them out as posts.json
// Requires two environment variables: DISCORD_TOKEN and DISCORD_CHANNEL_ID

const fs = require('fs');

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const OUTPUT_PATH = 'posts.json';

if (!TOKEN || !CHANNEL_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CHANNEL_ID environment variable.');
  process.exit(1);
}

async function debugListVisibleChannels() {
  const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: { Authorization: `Bot ${TOKEN}` },
  });
  const guilds = await guildsResponse.json();
  console.log(`Bot can see ${guilds.length} server(s):`, guilds.map((g) => `${g.name} (${g.id})`));

  for (const guild of guilds) {
    const channelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
      headers: { Authorization: `Bot ${TOKEN}` },
    });
    if (!channelsResponse.ok) {
      console.log(`Could not list channels for ${guild.name}: ${channelsResponse.status}`);
      continue;
    }
    const channels = await channelsResponse.json();
    console.log(`Channels in ${guild.name}:`, channels.map((c) => `${c.name} (${c.id}) type ${c.type}`));
  }
}

async function fetchMessages() {
  console.log(`Using channel ID: "${CHANNEL_ID}" (length: ${CHANNEL_ID.length})`);
  const url = `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    await debugListVisibleChannels();
    throw new Error(`Discord API request failed: ${response.status} ${body}`);
  }

  return response.json();
}

function cleanMessages(rawMessages) {
  return rawMessages
    .filter((message) => message.content && message.content.trim().length > 0)
    .map((message) => ({
      id: message.id,
      content: message.content,
      date: message.timestamp,
      dateDisplay: new Date(message.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function main() {
  const rawMessages = await fetchMessages();
  const posts = cleanMessages(rawMessages);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(posts, null, 2));
  console.log(`Wrote ${posts.length} posts to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
