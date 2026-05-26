# Dragonia Ticket Bot

A clean Discord ticket bot made for server owners, not programmers.

You get a polished ticket system, a visual config menu, support profiles, transcripts, business hours, logs and optional AI replies. Most setup is done inside Discord with `/ticket config`.

## Commands

There are only two commands:

```text
/ticket config
/ticket panel panel:support channel:#tickets
```

`/ticket config` opens the control menu.

`/ticket panel` sends one of your panels to a Discord channel.

## Fast Setup

1. Install Node.js LTS from `https://nodejs.org/`
2. Open `config.json`
3. Fill:

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "clientId": "YOUR_APPLICATION_CLIENT_ID",
  "guildId": "YOUR_SERVER_ID"
}
```

4. Double click `install.bat`
5. Double click `deploy-commands.bat`
6. Double click `start.bat`

Then open Discord and run:

```text
/ticket config
```

## Control Menu

When you run `/ticket config`, the first screen is the **Ticket Panel Manager**.

In this bot, a **panel** means a full support profile.

A panel is not only a message. Each panel can have its own:

- public ticket panel text
- categories
- staff roles
- Discord parent category IDs
- ticket channel names
- welcome messages
- ticket topic
- log channel
- logged events

From there you can:

- choose an existing panel
- create a new panel
- edit the selected panel
- delete the selected panel
- edit that panel's private log settings
- edit that panel's messages, hours, transcript and AI settings
- open the value/help page

This is the normal flow:

```text
/ticket config
-> choose panel
-> Panel Config
-> Panel Categories
-> Panel Messages
-> Panel Hours
-> Panel Transcript
-> Panel AI
-> Panel Logs
```

## Panel Manager

A panel is a full support profile.

Example panels:

```text
support
reports
staff-help
billing
donation-help
```

After creating a panel, send it like this:

```text
/ticket panel panel:reports channel:#reports
```

### Panel Config

Click `Panel Config` to edit:

- panel active: yes/no
- panel title
- panel description
- categories shown on that panel
- panel footer

Category example:

```text
general, billing, technical
```

### Panel Categories

Click `Panel Categories` to edit the selected panel's own categories.

Each line is one category profile:

```text
id | label | description | staffRoleIds | parentCategoryId | channelName
```

Example:

```text
general | General Support | General questions and help | 123456789012345678 | 111111111111111111 | ticket-{username}
billing | Billing Help | Purchases and invoices | 222222222222222222 | 111111111111111111 | billing-{username}
reports | Player Reports | Report a user or issue | 333333333333333333 | 444444444444444444 | report-{username}
```

This means each panel can have different categories.

Example:

```text
support panel -> general, billing, technical
reports panel -> reports, appeals, staff-help
donation panel -> donation-help, payment-help
```

Each one can use different staff roles and different parent Discord categories.

## Panel Logs

Each panel can have its own log channel.

Click:

```text
Panel Logs
```

You can set:

- use separate panel logs: yes/no
- panel log channel ID
- which events should be logged

Events:

```text
panelSent=yes
ticketCreated=yes
ticketClaimed=yes
ticketUnclaimed=yes
ticketClosed=yes
transcriptCreated=yes
aiReplyUsed=yes
```

Turn one off like this:

```text
aiReplyUsed=no
```

If panel logs are off, the panel will use the fallback log settings from `config.json`.

## Yes / No Settings

If a form asks `yes/no`:

```text
yes
```

means enabled.

```text
no
```

means disabled.

## Panel Messages

Click `Panel Messages` to edit messages for only the selected support profile:

- ticket created
- already open ticket
- claimed
- unclaimed
- closed

Other panels can use different text.

## Panel Hours

Use simple 24-hour format:

```text
09:00 - 18:00
18:45 - 19:20
```

The form asks:

```text
Use business hours? yes/no
Open between what times?
Allow tickets outside hours? yes/no
Send after-hours message? yes/no
After-hours message
```

These hours apply only to the selected panel.

## Panel Transcript

Click `Panel Transcript` to edit transcript behavior for only the selected panel:

- create transcripts: yes/no
- DM transcript to user: yes/no
- transcript log channel ID
- transcript brand name
- transcript footer text

## Panel AI

Click `Panel AI` to edit AI behavior for only the selected panel:

- use AI: yes/no
- auto reply: yes/no
- model
- opening prompt
- panel knowledge

Example: a billing panel can have billing AI instructions, while a report panel can have moderation/report instructions.

## Message Values

Use these inside ticket messages.

User:

```text
{opener}      user who opened the ticket
{ticketUser}  same as opener
{username}    opener name
{userId}      opener Discord ID
```

Staff:

```text
{claimer}     staff member who claimed
{closer}      staff member who closed
{staff}       staff member doing the action
{staffName}   staff member name
```

Ticket:

```text
{channel}     ticket channel mention
{channelName} ticket channel name
{ticketName}  ticket channel name
{category}    category name
{categoryId}  category ID
{panel}       panel ID
{guild}       Discord server name
```

Examples:

```text
{opener}, your ticket has been created: {channel}
Ticket claimed by {claimer}.
Ticket closed by {closer}.
```

## OpenAI Key

Add your OpenAI key in `config.json` once:

```json
"apiKey": "YOUR_OPENAI_API_KEY"
```

## Common Fixes

Old commands still show:

```text
deploy-commands.bat
```

Then press `Ctrl + R` in Discord.

Bot does not start:

- check token
- run `install.bat`
- make sure Node.js is installed

Tickets do not open:

- bot needs `Manage Channels`
- bot role should be high enough
- category IDs and role IDs must be correct

## Files

```text
config.json          private bot settings
config.example.json  public example config
install.bat          installs packages
deploy-commands.bat  clears old Discord commands and deploys the correct ones
start.bat            starts the bot
src/                 bot code
data/                ticket database
transcripts/         saved HTML transcripts
```

## Security

Never share:

- Discord bot token
- OpenAI API key
- private `config.json`

Use `Download Config` from the menu if you need a safe export.

## License

MIT
