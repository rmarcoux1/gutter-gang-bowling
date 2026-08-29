# Gutter Gang Bowling Stats

Track weekly league bowling match stats (3 strings/week, per bowler) and share them with teammates.

- `/infrastructure` — AWS CDK app: DynamoDB table, Lambda functions, API Gateway
- `/backend` — Lambda handler source (Node.js)
- `/frontend` — React app (Vite), deployed via AWS Amplify Hosting

See `DEPLOY.md` for setup and deploy steps.
