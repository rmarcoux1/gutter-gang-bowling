# Deploying Gutter Gang Bowling Stats

## Prerequisites
- Node.js 20+ and npm
- An AWS account, and the AWS CLI configured (`aws configure`) with credentials that can create DynamoDB tables, Lambda functions, API Gateway, Secrets Manager secrets, and IAM roles
- AWS CDK CLI: `npm install -g aws-cdk` (or use `npx cdk` from `/infrastructure`)
- If this is the first time using CDK in this AWS account/region: `cdk bootstrap`

## 1. Deploy the backend (infrastructure + Lambdas)

```
cd infrastructure
npm install
npx cdk deploy
```

This provisions:
- A DynamoDB table (`GutterGangBowlingStats`) with a GSI for per-player queries
- Three Lambda functions (matches, players, results) with read/write access to the table
- An HTTP API (API Gateway v2) wired to those Lambdas
- A Secrets Manager secret holding a random shared API key, baked into each Lambda's environment as `API_KEY_SECRET`

When it finishes, note the two outputs printed in your terminal:
- `ApiUrl` — the base URL of your API
- `ApiSecretArn` — the ARN of the shared secret

Get the secret's actual value:

```
aws secretsmanager get-secret-value --secret-id <ApiSecretArn> --query SecretString --output text
```

## 2. Configure and deploy the frontend

Copy `frontend/.env.example` to `frontend/.env` and fill in:
- `VITE_API_URL` = the `ApiUrl` output from step 1
- `VITE_API_KEY` = the secret value from step 1

Test locally first:

```
cd frontend
npm install
npm run dev
```

Then deploy via **AWS Amplify Hosting**:
1. Push this repo to GitHub (or GitLab/Bitbucket/CodeCommit)
2. In the AWS Amplify console, choose "New app" → "Host web app" → connect the repo, and point the app root at `frontend/` (Amplify's monorepo setting)
3. Amplify will pick up `frontend/amplify.yml` automatically for the build
4. In the Amplify app's environment variables, add `VITE_API_URL` and `VITE_API_KEY` with the same values as your `.env`
5. Deploy — Amplify gives you a live URL, and will auto-deploy on every push to your connected branch going forward

## 3. First-time data setup

Once both are live, open the site and:
1. Go to **Players** and add your teammates
2. Go to **Matches**, create this week's match (week number, date, opponent)
3. Open the match and log each bowler's score/strikes/spares/tens/orange-pins-left per string as you play

## Notes / known limitations of this v1
- Access control is a single shared API key (`x-api-key` header), not per-user login — anyone with the key can read and write. Fine for a private team tool; move to Cognito later if you want individual accounts or edit restrictions.
- `listMatches` and `listPlayers` use a DynamoDB `Scan` — totally fine at league scale (dozens of matches/players), but wouldn't be the pattern to keep at large scale.
- No offline/PWA support — you'll want a signal at the lanes if wifi is spotty.

## What wasn't verified in this session
This code was written and reviewed for correctness, but `npm install` could not be run here (this sandbox's outbound network doesn't reach the npm registry), so the build was not executed end-to-end. Run `npm install` and `npm run build` in each of `infrastructure/`, `backend/` (optional — CDK bundles it directly), and `frontend/` in your own environment as your first step, and fix up any dependency-version mismatches that surface.
