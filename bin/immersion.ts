#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { MCStack } from '../lib/mc-stack';

const app = new cdk.App();
const envEU  = { region: 'eu-west-1' };
new MCStack(app, 'MCStack', { env: envEU });
