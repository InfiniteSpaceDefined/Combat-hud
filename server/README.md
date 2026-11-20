# Combat HUD session server

The optional backend for **shared sessions**. It's one CloudFormation stack in your own AWS account. The app works without it. Players only connect when someone hosts or joins a session.

## What it creates

| Resource | Purpose |
|---|---|
| API Gateway WebSocket API (stage `live`) | The socket the app connects to. Throttled. |
| Lambda `<stack>-ws` | The session logic (`handler.js`, inlined). |
| DynamoDB table (on demand, TTL) | Sessions, seats, play data and feed. Everything expires after `SessionHours`. |
| Lambda `<stack>-killswitch` | Stops all traffic when an alarm fires (`killswitch.js`, inlined). |
| 2 CloudWatch alarms + SNS topic | Message flood and connection flood. Email alert and kill switch. |
| AWS Budget | Monthly cost alert by email. |
| IAM roles, log groups | Least privilege. Logs kept 7 days (main) and 30 days (kill switch). |

No VPC, NAT gateway, KMS keys or Secrets Manager, so it costs about nothing when idle and pennies a month for a weekly game.

## Deploy

Console: CloudFormation, **Create stack**, upload `template.yaml`, tick the IAM acknowledgement.

CLI:

```
aws cloudformation deploy --region eu-west-2 --stack-name combat-hud-sessions \
  --template-file template.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides AlertEmail=you@example.com HostPassphrase='a long passphrase'
```

Then:

- Confirm the SNS subscription email.
- Put the **WebSocketUrl** output into `SESSION_URL` in `index.html`.

## Parameters

| Name | Default | Notes |
|---|---|---|
| `AlertEmail` | (required) | Budget and kill-switch emails. |
| `HostPassphrase` | (required, 12+ chars) | Needed to start a session. Hidden in CloudFormation. Stored as a Lambda environment variable. |
| `AllowedOrigins` | GitHub Pages URL | Comma-separated browser origins allowed to connect. Browsers only: scripts can send any origin. |
| `MaxSeats` | 5 | Per session, including the DM. |
| `SessionHours` | 24 | Session lifetime. |
| `ThrottleRate` / `ThrottleBurst` | 5 / 10 | Messages per second across the whole API. |
| `ReservedConcurrency` | 2 | Use `0` on accounts with the default 10-concurrency limit. |
| `KillSwitchMessages` / `KillSwitchConnects` | 1000 / 100 | Per 5 minutes. |
| `MonthlyBudgetUsd` | 5 | |
| `LogRetentionDays` | 7 | |

## If the kill switch fires

You'll get an email. All traffic is stopped: the throttle is set to 0 and the Lambda concurrency to 0. Once things are quiet, turn it back on with the **ReviveCommand** from the stack outputs:

```
aws lambda invoke --region eu-west-2 --function-name <stack>-killswitch \
  --payload '{"action":"revive"}' --cli-binary-format raw-in-base64-out revive.json
```

## Changing the code

Edit `handler.js` or `killswitch.js`, then:

```
npm install
npm run build   # inlines both into template.yaml
npm test        # local tests: dynalite + a fake API Gateway endpoint
```

Then update the stack with the new `template.yaml`.

## Security notes

- Only the host passphrase can start a session. Players need the join code.
- Each player is the only writer of their own character, and only the DM changes settings. Tokens are random and stored hashed.
- Play data is checked against a strict schema: short text, number ranges, no `<` `>`. The app also shows everything as plain text.
- PDFs are never sent. Only the play data listed in the app's privacy note is.
