#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { BowlingStack } from "../lib/bowling-stack";

const app = new cdk.App();
new BowlingStack(app, "GutterGangBowlingStack", {
  /* Uncomment and set to pin to your account/region, or use `cdk deploy` with your default profile:
  env: { account: "123456789012", region: "us-east-1" },
  */
});
