'use strict';
// Combat HUD kill switch. Triggered by the CloudWatch alarms (via SNS): stops all traffic by
// setting the API throttle to 0 and the handler Lambda's concurrency to 0.
// Turn it back on with: aws lambda invoke --function-name <stack>-killswitch --payload '{"action":"revive"}' --cli-binary-format raw-in-base64-out out.json
const { ApiGatewayV2Client, UpdateStageCommand } = require('@aws-sdk/client-apigatewayv2');
const { LambdaClient, PutFunctionConcurrencyCommand, DeleteFunctionConcurrencyCommand } = require('@aws-sdk/client-lambda');

const E = process.env;
const apigw = new ApiGatewayV2Client(E.APIGW_ENDPOINT ? { endpoint: E.APIGW_ENDPOINT } : {});
const lambda = new LambdaClient(E.LAMBDA_ENDPOINT ? { endpoint: E.LAMBDA_ENDPOINT } : {});

async function setTraffic(on) {
  const rate = on ? Number(E.THROTTLE_RATE) : 0, burst = on ? Number(E.THROTTLE_BURST) : 0;
  await apigw.send(new UpdateStageCommand({ ApiId: E.API_ID, StageName: E.STAGE,
    DefaultRouteSettings: { ThrottlingRateLimit: rate, ThrottlingBurstLimit: burst } }));
  const conc = Number(E.RESERVED_CONCURRENCY) || 0;
  if (!on) await lambda.send(new PutFunctionConcurrencyCommand({ FunctionName: E.TARGET_FUNCTION, ReservedConcurrentExecutions: 0 }));
  else if (conc > 0) await lambda.send(new PutFunctionConcurrencyCommand({ FunctionName: E.TARGET_FUNCTION, ReservedConcurrentExecutions: conc }));
  else await lambda.send(new DeleteFunctionConcurrencyCommand({ FunctionName: E.TARGET_FUNCTION }));
}

exports.handler = async (ev) => {
  if (ev && ev.action === 'revive') { await setTraffic(true); console.log('revived'); return { revived: true }; }
  let alarmed = false, names = [];
  for (const r of (ev && ev.Records) || []) {
    try {
      const m = JSON.parse(r.Sns && r.Sns.Message);
      if (m && m.NewStateValue === 'ALARM') { alarmed = true; names.push(m.AlarmName); }
    } catch (e) { /* not an alarm message */ }
  }
  if (!alarmed) return { stopped: false };
  await setTraffic(false);
  console.log('KILL SWITCH: traffic stopped by', names.join(', '));
  return { stopped: true };
};
