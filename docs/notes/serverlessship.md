# ServerlessShip

**Serverless Feishu deploy notifier for minibot**

ServerlessShip is the lightweight serverless companion service for minibot deployments.
It is designed for a Vercel Hobby + Supabase Free stack and turns GitHub release or deploy events into Feishu notifications.

## Why this name

- **Serverless**: the service is intended to run as Vercel serverless functions
- **Ship**: it focuses on shipping minibot releases
- **Feishu**: notifications are delivered to Feishu users or groups

## Intended stack

- Vercel Hobby for the API layer and scheduled jobs
- Supabase Free for persistence and lightweight state
- GitHub Actions for release or deployment triggers
- Feishu app or bot messaging for delivery

## Core job

- Receive deployment completion events
- Format a release notification card
- Send the message to the target Feishu recipient
- Record delivery state for retries and audit
