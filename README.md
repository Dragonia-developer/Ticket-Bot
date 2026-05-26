# Dragonia Ticket Bot

A simple, clean and highly configurable Discord ticket bot.

It is made for any kind of Discord server: communities, game servers, shops, hosting teams, support servers and private groups. You can edit almost every message from `config.json` without touching the code.

## What It Can Do

- Send beautiful ticket panels with `/ticket panel`
- Create different panels for different channels
- Create different ticket categories such as general, billing and technical support
- Give each category its own staff roles, channel name, welcome message and transcript log channel
- Let staff claim and unclaim tickets
- Close tickets and generate styled HTML transcripts
- Send transcripts to the user by DM
- Save transcripts locally
- Use business hours
- Allow or block tickets outside business hours
- Send an automatic outside-hours notice inside tickets
- Set the bot status from config
- Add your server name and server information to the config
- Optional OpenAI support replies with custom prompts, styles and server knowledge

## Requirements

Install these first:

- Node.js 20 or newer
- A Discord bot application from the Discord Developer Portal

The bot needs these permissions in your server:

- Manage Channels
- View Channels
- Send Messages
- Read Message History
- Attach Files
- Manage Messages

If you want AI auto replies or full message reading, enable this in the Discord Developer Portal:

- Message Content Intent

## Quick Start

Download or clone the bot:

```bash
git clone https://github.com/Dragonia-developer/Ticket-Bot.git
cd Ticket-Bot
```

Install packages:

```bash
npm install
```

Create your private config:

```bash
copy config.example.json config.json
```

Edit `config.json` and fill these:

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "clientId": "YOUR_APPLICATION_CLIENT_ID",
  "guildId": "YOUR_SERVER_ID_FOR_TESTING"
}
```

Deploy slash commands:

```bash
npm run deploy
```

Start the bot:

```bash
npm start
```

On Windows PowerShell, if `npm` is blocked, use `npm.cmd`:

```powershell
npm.cmd install
npm.cmd run deploy
npm.cmd start
```

You can also use the included Windows files:

```text
install.bat
deploy-commands.bat
start.bat
```

## First Setup Checklist

1. Put your Discord bot token in `config.json`.
2. Put your application/client ID in `clientId`.
3. Put your server ID in `guildId` while testing.
4. Add your support role IDs to `permissions.managerRoles` or to each category's `supportRoleIds`.
5. Optional: add Discord parent category IDs to `discordCategoryId`.
6. Optional: add a transcript log channel ID to `transcript.logChannelId`.
7. Run `npm run deploy`.
8. Run `npm start`.
9. In Discord, send a panel with `/ticket panel panel:support channel:#your-channel`.

## Main Commands

Send a ticket panel:

```text
/ticket panel panel:support channel:#tickets
```

Open the private config panel:

```text
/ticket config
```

Check setup:

```text
/ticket setup
```

The `/ticket config` panel is only visible to you. It lets you:

- View important config sections
- Reload `config.json`
- Export public config with secrets hidden
- Open a form to edit values with dot paths like `server.name`, `claim.enabled` or `panels.support.title`

## Important Config Sections

### Server Info

This is used in panels, transcripts and AI context.

```json
"server": {
  "name": "Your Community",
  "description": "A friendly Discord community with organized support tickets.",
  "language": "English",
  "rules": "Be respectful, do not spam, and never share private credentials in tickets.",
  "supportInfo": "Support usually replies during business hours."
}
```

### Bot Status

Set the bot's Discord status from config.

```json
"bot": {
  "presence": {
    "enabled": true,
    "status": "online",
    "type": "Watching",
    "name": "support tickets"
  }
}
```

Valid `status` examples:

- `online`
- `idle`
- `dnd`
- `invisible`

Valid `type` examples:

- `Playing`
- `Watching`
- `Listening`
- `Competing`

### Panels

Panels are the messages users click to open tickets.

```json
"panels": {
  "support": {
    "enabled": true,
    "title": "Support Center",
    "description": "Need help? Select the category that best matches your request.",
    "subtitle": "Before opening a ticket",
    "subtitleText": "Please choose the correct category and describe your issue clearly.",
    "fields": [
      {
        "name": "What to include",
        "value": "Explain what happened and include screenshots or IDs when useful.",
        "inline": false
      }
    ],
    "footer": "One clear ticket is better than multiple duplicate tickets.",
    "selectPlaceholder": "Choose a support category",
    "allowMultipleOpenTickets": false,
    "categories": ["general", "billing", "technical"]
  }
}
```

You can create more panels by adding another panel key:

```json
"reports": {
  "enabled": true,
  "title": "Report Center",
  "description": "Open a report for staff review.",
  "selectPlaceholder": "Choose a report type",
  "allowMultipleOpenTickets": true,
  "categories": ["general"]
}
```

Then send it:

```text
/ticket panel panel:reports channel:#reports
```

### Categories

Categories control ticket channels and staff access.

```json
"general": {
  "enabled": true,
  "label": "General Support",
  "description": "Questions, reports and general help.",
  "discordCategoryId": "DISCORD_PARENT_CATEGORY_ID",
  "supportRoleIds": ["SUPPORT_ROLE_ID"],
  "logChannelId": "TRANSCRIPT_LOG_CHANNEL_ID",
  "channelName": "ticket-{username}",
  "welcomeTitle": "Welcome, {user}",
  "welcomeMessage": "Thanks for opening a ticket. Please describe your request clearly.",
  "topic": "Ticket for {user} | Category: {category}",
  "aiStyle": "friendly"
}
```

### Business Hours

```json
"businessHours": {
  "enabled": true,
  "timezone": "Europe/Istanbul",
  "allowTicketsOutsideHours": true,
  "sendNoticeInsideTicket": true,
  "days": {
    "monday": [{ "start": "09:00", "end": "18:00" }],
    "tuesday": [{ "start": "09:00", "end": "18:00" }],
    "saturday": [],
    "sunday": []
  }
}
```

If `allowTicketsOutsideHours` is `false`, users cannot open tickets outside business hours.

If it is `true`, tickets still open. If `sendNoticeInsideTicket` is also `true`, the bot posts the outside-hours message inside the ticket.

### Transcripts

```json
"transcript": {
  "enabled": true,
  "dmUser": true,
  "saveToFile": true,
  "logChannelId": "LOG_CHANNEL_ID",
  "html": {
    "title": "{guild} Ticket Transcript",
    "brandName": "Your Community Support",
    "accentColor": "#3B82F6",
    "includeBotMessages": true,
    "includeAttachments": true,
    "footerText": "Generated by Dragonia Ticket Bot"
  }
}
```

### AI Replies

AI is disabled by default.

To enable it, add your OpenAI API key and set `enabled` to `true`.

```json
"ai": {
  "enabled": true,
  "provider": "openai",
  "apiKey": "YOUR_OPENAI_API_KEY",
  "model": "gpt-4o-mini",
  "systemPrompt": "You are the support assistant for this Discord server. Be clear, polite, practical and safe.",
  "serverInfo": "Add products, services, links, plans, rules or common fixes here.",
  "knowledgeBase": [
    "Ask for screenshots or error messages when the issue is unclear.",
    "Never ask users for passwords, tokens or private keys."
  ],
  "autoReply": false,
  "replyInTicket": true,
  "defaultStyle": "friendly"
}
```

AI modes:

- Staff can press `AI Reply` in a ticket.
- If `autoReply` is `true`, the bot can reply automatically when the ticket owner writes.
- Each category can use a different `aiStyle`.

## Placeholders

You can use these in many config messages:

- `{user}`
- `{username}`
- `{userId}`
- `{category}`
- `{channel}`
- `{ticketName}`
- `{guild}`

## Safe Defaults

- `config.json` is ignored by git.
- Do not share your Discord token.
- Do not share your OpenAI API key.
- Use `/ticket config export` if you need to share your config, because it hides secrets.

## Project Files

```text
src/
  ai.js              OpenAI reply generation
  config.js          Config loading and saving
  deploy-commands.js Slash command registration
  index.js           Bot entry point
  tickets.js         Panels, ticket channels, claim, close, transcript
  transcript.js      HTML transcript generator
  utils.js           Helper functions
config.example.json  Public config template
config.json          Private local config, ignored by git
```

## License

MIT
