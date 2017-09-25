'use strict';

const crypto = require('crypto');
const deploymentName = `Deployment${crypto.randomBytes(4).toString('hex')}`;

module.exports = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'Fetches data for a wildfire demo map',
  Parameters: {
    GitSha: {
      Type: 'String',
      Description: 'The SHA',
    },
    ownerId: {
      Type: 'String',
      Description: 'owner id',
    },
    mapboxAccessToken: {
      Type: 'String',
      Description: 'mapbox access token',
    },
    pointsDatasetId: {
      Type: 'String',
      Description: 'points dataset id',
    },
    pointsTilesetName: {
      Type: 'String',
      Description: 'points tileset name',
    },
    maxPerimetersDatasetId: {
      Type: 'String',
      Description: 'max perimeters dataset id',
    },
    maxPerimetersTilesetName: {
      Type: 'String',
      Description: 'max perimeters tileset name',
    },
    perimeterDatasetNamePrefix: {
      Type: 'String',
      Description: 'prefix for perimeter dataset names',
    },
    AlarmEmail: {
      Type: 'String',
      Description: 'where to send alarms',
      Default: 'dclark@mapbox.com',
    },
  },
  Resources: {
    AlarmSNSTopic: {
      Type: 'AWS::SNS::Topic',
      Properties: {
        TopicName: { Ref: 'AWS::StackName' },
        Subscription: [
          {
            Endpoint: { Ref: 'AlarmEmail' },
            Protocol: 'email',
          },
        ],
      },
    },
    ErrorAlarm: {
      Type: 'AWS::CloudWatch::Alarm',
      Properties: {
        EvaluationPeriods: 1,
        Statistic: 'Sum',
        Threshold: 0,
        AlarmDescription: 'Error notification',
        Period: 60,
        AlarmActions: [
          { Ref: 'AlarmSNSTopic' },
        ],
        Namespace: 'AWS/Lambda',
        Dimensions: [
          {
            Name: 'FunctionName',
            Value: { Ref: 'UpdateFunction' },
          },
        ],
        ComparisonOperator: 'GreaterThanThreshold',
        MetricName: 'Errors',
      },
    },
    ScheduledRule: {
      Type: 'AWS::Events::Rule',
      Properties: {
        Description: 'ScheduledRule',
        ScheduleExpression: 'rate(2 hours)',
        State: 'ENABLED',
        Targets: [{
          Arn: { 'Fn::GetAtt': ['UpdateFunction', 'Arn'] },
          Id: 'ScheduledRuleTarget',
        }],
      },
    },
    PermissionForEventsToInvokeLambda: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: { Ref: 'UpdateFunction' },
        Action: 'lambda:InvokeFunction',
        Principal: 'events.amazonaws.com',
        SourceArn: { 'Fn::GetAtt': ['ScheduledRule', 'Arn'] },
      },
    },
    IamRole: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: ['sts:AssumeRole'],
            },
          ],
        },
        Policies: [
          {
            PolicyName: 'do-what-is-necessary',
            PolicyDocument: {
              Statement: [
                {
                  Effect: 'Allow',
                  Action: ['logs:*'],
                  Resource: 'arn:aws:logs:*:*:*',
                },
                {
                  Effect: 'Allow',
                  Action: ['apigateway:*'],
                  Resource: 'arn:aws:apigateway:*::/*',
                },
              ],
            },
          },
        ],
      },
    },
    UpdateFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Code: {
          S3Bucket: {
            'Fn::Join': [
              '',
              [
                'mapbox-',
                { Ref: 'AWS::Region' },
              ],
            ],
          },
          S3Key: {
            'Fn::Join': [
              '',
              [
                'bundles/wildfire-demo-public/',
                { Ref: 'GitSha' },
                '.zip',
              ],
            ],
          },
        },
        Role: {
          'Fn::GetAtt': [
            'IamRole',
            'Arn',
          ],
        },
        Description: 'Update wildfire data',
        Handler: 'index.update',
        MemorySize: 1000,
        Runtime: 'nodejs6.10',
        Timeout: 300,
        Environment: {
          Variables: {
            ownerId: { Ref: 'ownerId' },
            mapboxAccessToken: { Ref: 'mapboxAccessToken' },
            pointsDatasetId: { Ref: 'pointsDatasetId' },
            pointsTilesetName: { Ref: 'pointsTilesetName' },
            maxPerimetersDatasetId: { Ref: 'maxPerimetersDatasetId' },
            maxPerimetersTilesetName: { Ref: 'maxPerimetersTilesetName' },
            perimeterDatasetNamePrefix: { Ref: 'perimeterDatasetNamePrefix' },
          }
        },
      },
    },
    ProxyRole: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Sid: 'proxyrole',
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        },
        Policies: [
          {
            PolicyName: 'WriteLogs',
            PolicyDocument: {
              Statement: [
                {
                  Effect: 'Allow',
                  Action: ['logs:*'],
                  Resource: ['arn:aws:logs:*:*:*'],
                },
              ],
            },
          },
        ],
      },
    },
    PerimeterProxyFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Role: { 'Fn::GetAtt': ['ProxyRole', 'Arn'] },
        Code: {
          S3Bucket: {
            'Fn::Join': [
              '',
              [
                'mapbox-',
                { Ref: 'AWS::Region' },
              ],
            ],
          },
          S3Key: {
            'Fn::Join': [
              '',
              [
                'bundles/wildfire-demo-public/',
                { Ref: 'GitSha' },
                '.zip',
              ],
            ],
          },
        },
        Description: 'Read wildfire perimeters from Datasets API',
        Handler: 'index.perimeterProxy',
        MemorySize: 512,
        Runtime: 'nodejs6.10',
        Timeout: 300,
      },
    },
    AriclesProxyFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Role: { 'Fn::GetAtt': ['ProxyRole', 'Arn'] },
        Code: {
          S3Bucket: {
            'Fn::Join': [
              '',
              [
                'mapbox-',
                { Ref: 'AWS::Region' },
              ],
            ],
          },
          S3Key: {
            'Fn::Join': [
              '',
              [
                'bundles/wildfire-demo-public/',
                { Ref: 'GitSha' },
                '.zip',
              ],
            ],
          },
        },
        Description: 'Read wildfire articles from Inciweb RSS feeds',
        Handler: 'index.articlesProxy',
        MemorySize: 512,
        Runtime: 'nodejs6.10',
        Timeout: 300,
      },
    },
    ProxyApi: {
      Type: 'AWS::ApiGateway::RestApi',
      Properties: {
        Name: {
          'Fn::Join': [
            '',
            [
              { Ref: 'AWS::StackName' },
              '-datasets-proxy',
            ],
          ],
        },
      },
    },
    ProxyStage: {
      Type: 'AWS::ApiGateway::Stage',
      Properties: {
        DeploymentId: { Ref: deploymentName },
        StageName: 'wildfires',
        Description: 'Api Stage',
        RestApiId: { Ref: 'ProxyApi' },
        MethodSettings: [
          {
            HttpMethod: '*',
            ResourcePath: '/*',
            ThrottlingBurstLimit: 20,
            ThrottlingRateLimit: 5,
          },
        ],
      },
    },
    ProxyPerimeterResource: {
      Type: 'AWS::ApiGateway::Resource',
      Properties: {
        ParentId: { 'Fn::GetAtt': ['ProxyApi', 'RootResourceId'] },
        RestApiId: { Ref: 'ProxyApi' },
        PathPart: 'perimeter',
      },
    },
    ProxyPerimeterIdResource: {
      Type: 'AWS::ApiGateway::Resource',
      Properties: {
        ParentId: { Ref: 'ProxyPerimeterResource' },
        RestApiId: { Ref: 'ProxyApi' },
        PathPart: '{id}',
      },
    },
    ProxyArticlesResource: {
      Type: 'AWS::ApiGateway::Resource',
      Properties: {
        ParentId: { 'Fn::GetAtt': ['ProxyApi', 'RootResourceId'] },
        RestApiId: { Ref: 'ProxyApi' },
        PathPart: 'articles',
      },
    },
    ProxyArticlesIdResource: {
      Type: 'AWS::ApiGateway::Resource',
      Properties: {
        ParentId: { Ref: 'ProxyArticlesResource' },
        RestApiId: { Ref: 'ProxyApi' },
        PathPart: '{id}',
      },
    },
    ProxyPerimeterOptionsMethod: {
      Type: 'AWS::ApiGateway::Method',
      Properties: {
        RestApiId: { Ref: 'ProxyApi' },
        ResourceId: { Ref: 'ProxyPerimeterIdResource' },
        AuthorizationType: 'None',
        HttpMethod: 'OPTIONS',
        MethodResponses: [
          {
            StatusCode: 200,
            ResponseModels: {
              'application/json': 'Empty',
            },
            ResponseParameters: {
              'method.response.header.Access-Control-Allow-Headers': true,
              'method.response.header.Access-Control-Allow-Methods': true,
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        Integration: {
          Type: 'MOCK',
          IntegrationResponses: [
            {
              StatusCode: 200,
              ResponseParameters: {
                'method.response.header.Access-Control-Allow-Headers': '\'*\'',
                'method.response.header.Access-Control-Allow-Methods': '\'GET,OPTIONS\'',
                'method.response.header.Access-Control-Allow-Origin': '\'*\'',
              },
            },
          ],
        },
      },
    },
    ProxyPerimeterGetMethod: {
      Type: 'AWS::ApiGateway::Method',
      Properties: {
        RestApiId: { Ref: 'ProxyApi' },
        ResourceId: { Ref: 'ProxyPerimeterIdResource' },
        AuthorizationType: 'None',
        HttpMethod: 'GET',
        MethodResponses: [
          {
            StatusCode: 200,
            ResponseModels: {
              'application/json': 'Empty',
            },
            ResponseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
          {
            StatusCode: 500,
            ResponseModels: {
              'application/json': 'Empty',
            },
          },
        ],
        Integration: {
          Type: 'AWS',
          IntegrationHttpMethod: 'POST',
          RequestTemplates: {
            'application/json': {
              'Fn::Join': [
                '',
                [
                  '{"mapboxAccessToken":"',
                  { Ref: 'mapboxAccessToken' },
                  '","inciwebid":"$input.params(\'id\')",',
                  '"perimeterDatasetNamePrefix":"',
                  { Ref: 'perimeterDatasetNamePrefix' },
                  '"}',
                ],
              ],
            },
          },
          IntegrationResponses: [
            {
              StatusCode: 200,
              ResponseParameters: {
                'method.response.header.Access-Control-Allow-Origin': '\'*\'',
              },
            },
            {
              StatusCode: 500,
              SelectionPattern: 'error',
            },
          ],
          Uri: {
            'Fn::Join': [
              '',
              [
                'arn:aws:apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                { 'Fn::GetAtt': ['PerimeterProxyFunction', 'Arn'] },
                '/invocations',
              ],
            ],
          },
        },
      },
    },
    ProxyArticlesOptionsMethod: {
      Type: 'AWS::ApiGateway::Method',
      Properties: {
        RestApiId: { Ref: 'ProxyApi' },
        ResourceId: { Ref: 'ProxyArticlesIdResource' },
        AuthorizationType: 'None',
        HttpMethod: 'OPTIONS',
        MethodResponses: [
          {
            StatusCode: 200,
            ResponseModels: {
              'application/json': 'Empty',
            },
            ResponseParameters: {
              'method.response.header.Access-Control-Allow-Headers': true,
              'method.response.header.Access-Control-Allow-Methods': true,
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
        Integration: {
          Type: 'MOCK',
          IntegrationResponses: [
            {
              StatusCode: 200,
              ResponseParameters: {
                'method.response.header.Access-Control-Allow-Headers': '\'*\'',
                'method.response.header.Access-Control-Allow-Methods': '\'GET,OPTIONS\'',
                'method.response.header.Access-Control-Allow-Origin': '\'*\'',
              },
            },
          ],
        },
      },
    },
    ProxyArticlesGetMethod: {
      Type: 'AWS::ApiGateway::Method',
      Properties: {
        RestApiId: { Ref: 'ProxyApi' },
        ResourceId: { Ref: 'ProxyArticlesIdResource' },
        AuthorizationType: 'None',
        HttpMethod: 'GET',
        MethodResponses: [
          {
            StatusCode: 200,
            ResponseModels: {
              'application/json': 'Empty',
            },
            ResponseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
          {
            StatusCode: 500,
            ResponseModels: {
              'application/json': 'Empty',
            },
          },
        ],
        Integration: {
          Type: 'AWS',
          IntegrationHttpMethod: 'POST',
          RequestTemplates: {
            'application/json': '{"inciwebid":"$input.params(\'id\')"}',
          },
          IntegrationResponses: [
            {
              StatusCode: 200,
              ResponseParameters: {
                'method.response.header.Access-Control-Allow-Origin': '\'*\'',
              },
            },
            {
              StatusCode: 500,
              SelectionPattern: 'error',
            },
          ],
          Uri: {
            'Fn::Join': [
              '',
              [
                'arn:aws:apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                { 'Fn::GetAtt': ['AriclesProxyFunction', 'Arn'] },
                '/invocations',
              ],
            ],
          },
        },
      },
    },
    PerimeterProxyPermission: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: { Ref: 'PerimeterProxyFunction' },
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: {
          'Fn::Join': [
            '',
            [
              'arn:aws:execute-api:',
              { Ref: 'AWS::Region' },
              ':',
              { Ref: 'AWS::AccountId' },
              ':',
              { Ref: 'ProxyApi' },
              '/*',
            ],
          ],
        },
      },
    },
    AriclesProxyPermission: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: { Ref: 'AriclesProxyFunction' },
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: {
          'Fn::Join': [
            '',
            [
              'arn:aws:execute-api:',
              { Ref: 'AWS::Region' },
              ':',
              { Ref: 'AWS::AccountId' },
              ':',
              { Ref: 'ProxyApi' },
              '/*',
            ],
          ],
        },
      },
    },
  },
  Outputs: {
    ProxyUrl: {
      Value: {
        'Fn::Join': [
          '',
          [
            'https://',
            { Ref: 'ProxyApi' },
            '.execute-api.',
            { Ref: 'AWS::Region' },
            '.amazonaws.com/wildfires',
          ],
        ],
      },
    },
  },
};

module.exports.Resources[deploymentName] = {
  Type: 'AWS::ApiGateway::Deployment',
  DependsOn: [
    'ProxyPerimeterGetMethod',
    'ProxyPerimeterOptionsMethod',
    'ProxyArticlesGetMethod',
    'ProxyArticlesOptionsMethod',
  ],
  Properties: {
    RestApiId: { Ref: 'ProxyApi' },
    StageName: 'unused',
  },
};
