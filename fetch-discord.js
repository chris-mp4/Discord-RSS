// Fetches messages from a Discord channel, downloads any image attachments
// into an images folder so they stay permanent, and writes posts.json.
// Requires two environment variables: DISCORD_TOKEN and DISCORD_CHANNEL_ID

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const OUTPUT_PATH = 'posts.json';
const IMAGES_DIR = 'images';

if (!TOKEN || !CHANNEL_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CHANNEL_ID environment variable.');
  process.exit(1);
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

function isImageAttachment(attachment) {
  const ext = path.extname(attachment.filename || '').toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

async function fetchMessages() {
  const url = `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${TOKEN}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord API request failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function downloadImage(attachment, messageId) {
  const ext = path.extname(attachment.filename || '') || '.png';
  const localFilename = `${messageId}-${attachment.id}${ext}`;
  const localPath = path.join(IMAGES_DIR, localFilename);

  if (fs.existsSync(localPath)) {
    return localFilename;
  }

  const response = await fetch(attachment.url);
  if (!response.ok) {
    console.log(`Could not download attachment ${attachment.url}: ${response.status}`);
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.writeFileSync(localPath, buffer);
  return localFilename;
}

async function buildPost(message) {
  const imageFilenames = [];

  for (const attachment of message.attachments || []) {
    if (!isImageAttachment(attachment)) continue;
    const localFilename = await downloadImage(attachment, message.id);
    if (localFilename) imageFilenames.push(localFilename);
  }

  return {
    id: message.id,
    content: message.content,
    images: imageFilenames,
    date: message.timestamp,
    dateDisplay: new Date(message.timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
}

async function buildPosts(rawMessages) {
  const relevant = rawMessages.filter(
    (message) =>
      (message.content && message.content.trim().length > 0) ||
      (message.attachments && message.attachments.some(isImageAttachment))
  );

  const posts = [];
  for (const message of relevant) {
    posts.push(await buildPost(message));
  }

  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function main() {
  const rawMessages = await fetchMessages();
  const posts = await buildPosts(rawMessages);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(posts, null, 2));
  console.log(`Wrote ${posts.length} posts to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
