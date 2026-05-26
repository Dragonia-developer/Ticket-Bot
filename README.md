# Dragonia Ticket Bot

Beautiful, simple and powerful Discord ticket bot.

This bot is made for people who do not know coding. You edit one file, click one bat file, and use two Discord commands.

## What You Get

- Clean ticket panel
- Easy `/ticket config` menu
- Multiple ticket categories
- Staff role support
- Claim button
- Close button
- HTML transcripts
- Transcript DM to users
- Business hours
- Outside-hours messages
- Bot status from config
- Optional AI support assistant
- Simple Windows `.bat` files

## The Only Discord Commands

There are only two main commands:

```text
/ticket panel panel:support channel:#tickets
/ticket config
```

That is it.

`/ticket panel` sends the ticket panel to a channel.

`/ticket config` opens a private control panel only you can see.

## Super Simple Setup

### 1. Install Node.js

Download Node.js from:

```text
https://nodejs.org/
```

Install the LTS version.

### 2. Download This Bot

Download the project from GitHub:

```text
https://github.com/Dragonia-developer/Ticket-Bot
```

Extract it anywhere you want.

### 3. Open `config.json`

Find this file:

```text
config.json
```

Fill these values:

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "clientId": "YOUR_APPLICATION_CLIENT_ID",
  "guildId": "YOUR_SERVER_ID"
}
```

Do not share your token with anyone.

### 4. Install Packages

Double click:

```text
install.bat
```

Wait until it finishes.

### 5. Add Commands to Discord

Double click:

```text
deploy-commands.bat
```

This removes old command versions and adds the correct commands again.

### 6. Start the Bot

Double click:

```text
start.bat
```

If the window says the bot logged in, it is working.

## First Test

In Discord, type:

```text
/ticket config
```

You should see the private config control panel.

Then send a ticket panel:

```text
/ticket panel panel:support channel:#tickets
```

Replace `#tickets` with the channel where you want the panel.

## Config Panel

Use:

```text
/ticket config
```

The bot opens a private menu with sections:

- Server Info
- Bot Status
- Ticket Panels
- Categories
- Business Hours
- Transcripts
- AI Assistant
- Bot Messages

Buttons:

- `Manage Panels` creates, edits and deletes ticket panels
- `Log Settings` opens the log settings section
- `Edit Selected` opens an easy form for the selected section
- `Values / Paths` shows useful setting names and what they mean
- `Reload File` reloads `config.json`
- `Download Config` sends you a safe config export with secrets hidden
- `Advanced Path Edit` changes one exact setting if you already know the path

### Easy Forms

Pick a section, then click `Edit Selected`.

For example, if you select `Business Hours`, the form asks:

```text
Use business hours? yes/no
Open between what times?
Allow tickets outside hours? yes/no
Send after-hours message? yes/no
After-hours message
```

So you can write:

```text
yes
18:45 - 19:20
yes
yes
Our team is currently offline. Please leave your message here.
```

No code needed.

### Manage Panels

Click:

```text
Manage Panels
```

From there you can:

- Create a new panel
- Edit the selected panel
- Delete the selected panel
- Choose which categories appear on that panel

Example panel IDs:

```text
support
reports
staff-help
donation-help
```

After creating a panel, send it with:

```text
/ticket panel panel:reports channel:#reports
```

### Logs

Click:

```text
Log Settings
```

You can set:

```text
Use logs? yes/no
Log channel ID
What should be logged?
```

Events you can turn on or off:

```text
panelSent=yes
ticketCreated=yes
ticketClaimed=yes
ticketUnclaimed=yes
ticketClosed=yes
transcriptCreated=yes
aiReplyUsed=yes
```

To disable one:

```text
aiReplyUsed=no
```

### Yes / No Settings

If the form asks `yes/no`:

```text
yes
```

means active.

```text
no
```

means disabled.

### Time Settings

Use 24-hour time:

```text
09:00 - 18:00
18:45 - 19:20
```

### Role IDs

For staff roles, paste one role ID per line:

```text
123456789012345678
987654321098765432
```

### Advanced Path Edit

Use this only when you already know the exact setting name.

Examples:

```text
server.name
```

```text
My Cool Server
```

```text
panels.support.title
```

```text
Support Center
```

```text
claim.enabled
```

```text
true
```

For role lists, use this style:

```text
categories.general.supportRoleIds
```

```json
["123456789012345678"]
```

## Message Values

You can use these values inside messages, welcome text, transcript DM text, claim text and close text.

User values:

```text
{opener}      user who opened the ticket
{ticketUser}  same as opener
{username}    opener name
{userId}      opener Discord ID
```

Staff values:

```text
{claimer}     staff member who claimed the ticket
{closer}      staff member who closed the ticket
{staff}       staff member doing the action
{staffName}   staff member name
```

Ticket values:

```text
{channel}     ticket channel mention
{channelName} ticket channel name
{ticketName}  ticket channel name
{category}    ticket category name
{categoryId}  ticket category ID
{panel}       panel ID
{guild}       Discord server name
```

Examples:

```text
{opener}, your ticket has been created: {channel}
```

```text
Ticket claimed by {claimer}.
```

```text
Ticket closed by {closer}. Transcript for {ticketName} is ready.
```

## Important Config Parts

### Server Name

```json
"server": {
  "name": "Your Community",
  "description": "A friendly Discord community with organized support tickets.",
  "language": "English"
}
```

This appears in the bot panel and helps the AI understand your server.

### Bot Status

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

This makes the bot show something like:

```text
Watching support tickets
```

### Ticket Panel

```json
"panels": {
  "support": {
    "enabled": true,
    "title": "Support Center",
    "description": "Need help? Select the category that best matches your request.",
    "selectPlaceholder": "Choose a support category",
    "categories": ["general", "billing", "technical"]
  }
}
```

### Ticket Categories

```json
"categories": {
  "general": {
    "enabled": true,
    "label": "General Support",
    "description": "Questions, reports and general help.",
    "supportRoleIds": [],
    "channelName": "ticket-{username}",
    "welcomeMessage": "Thanks for opening a ticket. Please describe your request clearly."
  }
}
```

Put your staff role IDs in:

```json
"supportRoleIds": ["ROLE_ID_HERE"]
```

### Business Hours

```json
"businessHours": {
  "enabled": true,
  "allowTicketsOutsideHours": true,
  "sendNoticeInsideTicket": true
}
```

If you want to block tickets outside working hours:

```json
"allowTicketsOutsideHours": false
```

### AI Assistant

AI is off by default.

To use it, fill:

```json
"ai": {
  "enabled": true,
  "apiKey": "YOUR_OPENAI_API_KEY",
  "systemPrompt": "You are the support assistant for this Discord server.",
  "serverInfo": "Write server details, links, prices, rules or common fixes here."
}
```

AI can help staff write replies. It can also auto reply if you turn on:

```json
"autoReply": true
```

## Common Problems

### I still see old commands

Run:

```text
deploy-commands.bat
```

Then restart Discord with `Ctrl + R`.

### The bot does not start

Check:

- `token` is correct
- Node.js is installed
- You ran `install.bat`

### The panel does not create tickets

Check:

- The bot has `Manage Channels`
- The bot role is above staff roles
- Category IDs and role IDs are correct

### Config changed but bot did not update

Use:

```text
/ticket config
```

Then click:

```text
Reload File
```

## File Guide

```text
config.json          Your private settings
config.example.json  Example settings
start.bat            Starts the bot
install.bat          Installs packages
deploy-commands.bat  Fixes and adds Discord commands
src/                 Bot code
transcripts/         Saved ticket transcripts
data/                Ticket database
```

## Safety

- Never share `config.json` if it has your token.
- Never post your Discord bot token.
- Never post your OpenAI API key.
- Use `Download Config` in `/ticket config` if you need a safe export.

## License

MIT
