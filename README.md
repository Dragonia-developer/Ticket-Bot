# Dragonia Ticket Bot

A clean Discord ticket bot made for server owners, not programmers.

You get a polished ticket system, a visual config menu, panel management, transcripts, business hours, logs and optional AI replies. Most setup is done inside Discord with `/ticket config`.

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

From there you can:

- choose an existing panel
- create a new panel
- edit the selected panel
- delete the selected panel
- edit that panel's private log settings
- open general bot settings
- open the value/help page

This is the normal flow:

```text
/ticket config
-> choose panel
-> Panel Config
-> Panel Logs
-> Bot Settings if needed
```

## Panel Manager

A panel is the public message users click to open tickets.

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

If panel logs are off, the bot uses the global log settings.

## Bot Settings

Click `Bot Settings` for general settings:

- server info
- bot status
- categories
- business hours
- global logs
- transcripts
- AI assistant
- bot messages

Pick a section and click `Edit Selected`.

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

## Business Hours

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

## AI Assistant

AI is off by default.

In `Bot Settings -> AI Assistant`, you can edit:

- use AI: yes/no
- auto reply: yes/no
- model
- opening prompt
- server knowledge

Add your OpenAI key in `config.json`:

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
