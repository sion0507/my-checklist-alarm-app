#!/usr/bin/env node

const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const apply = process.argv.includes('--apply');

if (!redisUrl || !redisToken) {
  console.error('Missing KV_REST_API_URL/UPSTASH_REDIS_REST_URL or KV_REST_API_TOKEN/UPSTASH_REDIS_REST_TOKEN');
  process.exit(1);
}

async function redisCommand(command) {
  const response = await fetch(redisUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error(`Redis command failed with status ${response.status}`);
  }
  const body = await response.json();
  if (body.error) {
    throw new Error(`Redis command error: ${body.error}`);
  }
  return body.result;
}

async function redisPipeline(commands) {
  if (commands.length === 0) return [];
  const response = await fetch(`${redisUrl.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!response.ok) {
    throw new Error(`Redis pipeline failed with status ${response.status}`);
  }
  const body = await response.json();
  if (!Array.isArray(body)) {
    throw new Error('Redis pipeline returned an invalid response');
  }
  for (const item of body) {
    if (item?.error) {
      throw new Error(`Redis pipeline error: ${item.error}`);
    }
  }
  return body.map((item) => item?.result);
}

const keys = await redisCommand(['KEYS', 'push:*']);
const pushKeys = Array.isArray(keys) ? keys : [];

console.log(JSON.stringify({ dryRun: !apply, matchedKeys: pushKeys.length, keys: pushKeys }, null, 2));

if (apply && pushKeys.length > 0) {
  await redisPipeline(pushKeys.map((key) => ['DEL', key]));
  console.log(JSON.stringify({ deletedKeys: pushKeys.length }, null, 2));
}
