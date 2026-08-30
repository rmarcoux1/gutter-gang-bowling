import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as path from "path";

export class BowlingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --- Storage -----------------------------------------------------
    const table = new dynamodb.Table(this, "BowlingStatsTable", {
      tableName: "GutterGangBowlingStats",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN, // don't lose match history if the stack is torn down
    });

    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
    });

    // --- Shared API secret (v1 access control, see backend/src/lib/auth.ts) ---
    const apiSecret = new secretsmanager.Secret(this, "ApiSharedSecret", {
      description: "Shared x-api-key value the frontend sends on every request",
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // --- Lambda functions ---------------------------------------------
    // backend/ is a sibling of infrastructure/, not a subdirectory of it, so the
    // NodejsFunction bundler can't auto-detect the right project root/lock file
    // from here — point it at backend/ explicitly. Requires `npm install` to have
    // been run inside backend/ (so backend/package-lock.json exists).
    const backendRoot = path.join(__dirname, "..", "..", "backend");
    const backendDir = path.join(backendRoot, "src", "handlers");

    const commonProps: Partial<nodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        TABLE_NAME: table.tableName,
        API_KEY_SECRET: apiSecret.secretValue.unsafeUnwrap(), // baked in at deploy time; rotate by redeploying
      },
      projectRoot: backendRoot,
      depsLockFilePath: path.join(backendRoot, "package-lock.json"),
      bundling: { minify: true, sourceMap: false },
    };

    const matchesFn = new nodejs.NodejsFunction(this, "MatchesFunction", {
      entry: path.join(backendDir, "matches.ts"),
      ...commonProps,
    });

    const resultsFn = new nodejs.NodejsFunction(this, "ResultsFunction", {
      entry: path.join(backendDir, "results.ts"),
      ...commonProps,
    });

    const playersFn = new nodejs.NodejsFunction(this, "PlayersFunction", {
      entry: path.join(backendDir, "players.ts"),
      ...commonProps,
    });

    const seasonsFn = new nodejs.NodejsFunction(this, "SeasonsFunction", {
      entry: path.join(backendDir, "seasons.ts"),
      ...commonProps,
    });

    const paymentsFn = new nodejs.NodejsFunction(this, "PaymentsFunction", {
      entry: path.join(backendDir, "payments.ts"),
      ...commonProps,
    });

    const fillsFn = new nodejs.NodejsFunction(this, "FillsFunction", {
      entry: path.join(backendDir, "fills.ts"),
      ...commonProps,
    });

    table.grantReadWriteData(matchesFn);
    table.grantReadWriteData(resultsFn);
    table.grantReadWriteData(playersFn);
    table.grantReadWriteData(seasonsFn);
    table.grantReadWriteData(paymentsFn);
    table.grantReadWriteData(fillsFn);

    // --- HTTP API --------------------------------------------------------
    const httpApi = new apigwv2.HttpApi(this, "BowlingHttpApi", {
      apiName: "gutter-gang-bowling-api",
      corsPreflight: {
        allowOrigins: [
          "https://theguttergang.net",
          "https://www.theguttergang.net",
          "http://localhost:5173", // local `npm run dev`
          // Add your *.amplifyapp.com URL here too if you still use it for testing.
        ],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
        ],
        allowHeaders: ["Content-Type", "x-api-key"],
      },
    });

    const matchesIntegration = new integrations.HttpLambdaIntegration("MatchesIntegration", matchesFn);
    const resultsIntegration = new integrations.HttpLambdaIntegration("ResultsIntegration", resultsFn);
    const playersIntegration = new integrations.HttpLambdaIntegration("PlayersIntegration", playersFn);
    const seasonsIntegration = new integrations.HttpLambdaIntegration("SeasonsIntegration", seasonsFn);
    const paymentsIntegration = new integrations.HttpLambdaIntegration("PaymentsIntegration", paymentsFn);
    const fillsIntegration = new integrations.HttpLambdaIntegration("FillsIntegration", fillsFn);

    httpApi.addRoutes({ path: "/matches", methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], integration: matchesIntegration });
    httpApi.addRoutes({
      path: "/matches/{matchId}",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: matchesIntegration,
    });
    httpApi.addRoutes({ path: "/matches/{matchId}/results", methods: [apigwv2.HttpMethod.POST], integration: resultsIntegration });
    httpApi.addRoutes({
      path: "/matches/{matchId}/results/{playerId}/{stringNumber}",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: resultsIntegration,
    });
    httpApi.addRoutes({ path: "/matches/{matchId}/payments", methods: [apigwv2.HttpMethod.POST], integration: paymentsIntegration });
    httpApi.addRoutes({
      path: "/matches/{matchId}/payments/{playerId}",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: paymentsIntegration,
    });
    httpApi.addRoutes({ path: "/matches/{matchId}/fills", methods: [apigwv2.HttpMethod.POST], integration: fillsIntegration });
    httpApi.addRoutes({
      path: "/matches/{matchId}/fills/{playerId}/{fillId}",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: fillsIntegration,
    });
    httpApi.addRoutes({ path: "/players", methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], integration: playersIntegration });
    // Static path — must be registered so it takes precedence over the {playerId} routes below.
    httpApi.addRoutes({ path: "/players/summary", methods: [apigwv2.HttpMethod.GET], integration: playersIntegration });
    httpApi.addRoutes({ path: "/players/{playerId}/stats", methods: [apigwv2.HttpMethod.GET], integration: playersIntegration });
    httpApi.addRoutes({ path: "/players/{playerId}/weekly", methods: [apigwv2.HttpMethod.GET], integration: playersIntegration });
    httpApi.addRoutes({
      path: "/players/{playerId}",
      methods: [apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: playersIntegration,
    });

    // Static path — must be registered before /seasons's generic GET/POST below
    // isn't strictly needed here (no {seasonId} route), but keep the pattern
    // consistent with /players/summary for readability.
    httpApi.addRoutes({ path: "/seasons/current", methods: [apigwv2.HttpMethod.GET], integration: seasonsIntegration });
    httpApi.addRoutes({ path: "/seasons", methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], integration: seasonsIntegration });
    httpApi.addRoutes({ path: "/seasons/{seasonId}", methods: [apigwv2.HttpMethod.DELETE], integration: seasonsIntegration });

    new CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "ApiSecretArn", { value: apiSecret.secretArn });
    new CfnOutput(this, "TableName", { value: table.tableName });
  }
}
