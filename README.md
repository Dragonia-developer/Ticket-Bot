# Dragonia Ticket Bot

A clean, configurable Discord ticket bot for public communities, support servers, gaming servers and small businesses. It includes multiple ticket panels, category based staff roles, claim buttons, business hours, HTML transcripts, DM transcript delivery and optional AI assisted replies.

## Features

- Multiple panels from `config.json`
- `/ticket panel panel:<id> channel:<#channel>` to publish any panel
- `/ticket config get`, `/ticket config set`, `/ticket config reload`, `/ticket config export`
- Category specific Discord parent categories, support roles, welcome text and channel names
- Claim and unclaim system
- Optional ticket channel rename when claimed
- Business hours with per-day time ranges
- Option to block ticket creation outside working hours
- Option to allow tickets outside working hours and send an automatic notice inside the ticket
- HTML transcript generator with custom title, brand name, accent color and footer
- Transcript log channel support
- Optional transcript DM to the ticket owner
- Optional OpenAI powered support suggestions or automatic replies
- All public text is editable in `config.json`

## Requirements

- Node.js 20 or newer
- A Discord bot application
- Bot permissions:
  - Manage Channels
  - View Channels
  - Send Messages
  - Read Message History
  - Attach Files
  - Manage Messages
- Privileged Gateway Intent:
  - Message Content Intent is needed for AI auto replies and better transcripts.

## Installation

```bash
git clone https://github.com/Dragonia-developer/Ticket-Bot.git
cd Ticket-Bot
npm install
copy config.example.json config.json
```

On Windows PowerShell, if `npm` is blocked by execution policy, use:

```powershell
npm.cmd install
npm.cmd run deploy
npm.cmd start
```

## Configuration

Edit `config.json`.

Required values:

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "clientId": "YOUR_APPLICATION_CLIENT_ID",
  "guildId": "OPTIONAL_TEST_GUILD_ID_FOR_FAST_COMMAND_DEPLOY"
}
```

Use `guildId` while testing because guild commands update quickly. Leave it empty only when you are ready to deploy global commands.

Important sections:

- `messages`: every bot response and notice text
- `businessHours`: working days, hours, outside-hours behavior
- `transcript`: HTML transcript, transcript log channel and DM settings
- `claim`: claim system settings
- `ai`: OpenAI model, style prompts and auto reply behavior
- `panels`: public ticket panels
- `categories`: ticket types, staff roles, Discord parent categories and welcome messages

## Deploy Commands

```bash
npm run deploy
```

Then start the bot:

```bash
npm start
```

## Main Commands

Send a panel:

```text
/ticket panel panel:support channel:#tickets
```

Show setup status:

```text
/ticket setup
```

Read a config value:

```text
/ticket config get path:panels.support.title
```

Update a config value:

```text
/ticket config set path:claim.enabled value:false
/ticket config set path:messages.outsideHoursNotice value:Our team is offline right now. We will reply soon.
/ticket config set path:categories.general.supportRoleIds value:["123456789012345678"]
```

Reload after manual file edits:

```text
/ticket config reload
```

Export public config with secrets hidden:

```text
/ticket config export
```

## Panels

Panels are defined under `panels`.

```json
"panels": {
  "support": {
    "enabled": true,
    "title": "Support Center",
    "description": "Choose the topic that best matches your request.",
    "buttonLabel": "Open Ticket",
    "selectPlaceholder": "Select a ticket category",
    "allowMultipleOpenTickets": false,
    "categories": ["general", "billing", "technical"]
  }
}
```

Add another panel by creating a new key:

```json
"staff-help": {
  "enabled": true,
  "title": "Staff Help Desk",
  "description": "Internal staff requests.",
  "selectPlaceholder": "Choose a staff request type",
  "allowMultipleOpenTickets": true,
  "categories": ["general", "technical"]
}
```

Publish it with:

```text
/ticket panel panel:staff-help channel:#staff-support
```

## Categories

Categories control where tickets are created and who can see them.

```json
"general": {
  "enabled": true,
  "label": "General Support",
  "description": "Questions, reports and general help.",
  "emoji": "💬",
  "discordCategoryId": "DISCORD_PARENT_CATEGORY_ID",
  "supportRoleIds": ["SUPPORT_ROLE_ID"],
  "logChannelId": "TRANSCRIPT_LOG_CHANNEL_ID",
  "channelName": "ticket-{username}",
  "welcomeTitle": "Welcome, {user}",
  "welcomeMessage": "Please describe your request clearly.",
  "topic": "Ticket for {user} | Category: {category}",
  "aiStyle": "friendly"
}
```

Supported placeholders:

- `{user}`
- `{username}`
- `{userId}`
- `{category}`
- `{channel}`
- `{ticketName}`
- `{guild}`

## Business Hours

```json
"businessHours": {
  "enabled": true,
  "timezone": "Europe/Istanbul",
  "allowTicketsOutsideHours": true,
  "sendNoticeInsideTicket": true,
  "days": {
    "monday": [{ "start": "09:00", "end": "18:00" }],
    "saturday": [],
    "sunday": []
  }
}
```

If `allowTicketsOutsideHours` is `false`, users cannot open tickets outside the configured hours.

If `allowTicketsOutsideHours` and `sendNoticeInsideTicket` are both `true`, the ticket opens and the bot posts the configured outside-hours message inside the ticket.

## AI Replies

AI is disabled by default.

```json
"ai": {
  "enabled": true,
  "provider": "openai",
  "apiKey": "YOUR_OPENAI_API_KEY",
  "model": "gpt-4o-mini",
  "autoReply": false,
  "replyInTicket": true,
  "defaultStyle": "friendly"
}
```

When AI is enabled:

- Staff can press the `AI Reply` button inside a ticket.
- If `autoReply` is `true`, the bot can automatically reply when the ticket owner sends a message.
- Each category can select a style with `aiStyle`.

Style prompts are configured in `ai.styles`, so you can create styles like `friendly`, `professional`, `technical`, `sales`, `strict` or `short`.

## Transcript

Transcripts are generated as styled HTML files.

```json
"transcript": {
  "enabled": true,
  "dmUser": true,
  "saveToFile": true,
  "logChannelId": "LOG_CHANNEL_ID",
  "html": {
    "title": "{guild} Ticket Transcript",
    "brandName": "Support Team",
    "accentColor": "#5865F2",
    "includeBotMessages": true,
    "includeAttachments": true,
    "footerText": "Generated by Dragonia Ticket Bot"
  }
}
```

## Security Notes

- Do not commit `config.json`.
- Keep your Discord token and OpenAI API key private.
- Use `/ticket config export` when you need to share config, because it hides secrets.
- The AI safety prompt tells the assistant not to request passwords, tokens, card details or private keys.

## Project Structure

```text
src/
  ai.js              OpenAI reply generation
  config.js          Config loading and saving
  deploy-commands.js Slash command registration
  index.js           Bot entry point and interaction router
  tickets.js         Ticket panels, channels, claim, close, transcript
  transcript.js      HTML transcript generator
  utils.js           Shared helpers
config.example.json  Public template config
config.json          Local private config, ignored by git
```

## License

MIT
