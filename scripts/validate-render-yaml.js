const fs = require('fs');

const text = fs.readFileSync('render.yaml', 'utf8');

const required = [
  'databases:',
  'name: reachinbox-db',
  'name: reachinbox-api',
  'name: reachinbox-frontend',
  'plan: free',
  'preDeployCommand: npx prisma migrate deploy',
  'staticPublishPath: dist',
  'VITE_API_URL',
  'DATABASE_URL',
  'sync: false',
];

const forbidden = [
  'reachinbox-redis',
  'reachinbox-elasticsearch',
  'reachinbox-worker',
  'ELASTICSEARCH_URL',
  'REDIS_URL',
  'type: keyvalue',
  'type: pserv',
];

for (const needle of required) {
  if (!text.includes(needle)) {
    console.error('MISSING:', needle);
    process.exit(1);
  }
  console.log('ok', needle);
}

for (const needle of forbidden) {
  if (text.includes(needle)) {
    console.error('FORBIDDEN leftover:', needle);
    process.exit(1);
  }
}

if (/xoxb-[A-Za-z0-9]/i.test(text) || /sk_live_/i.test(text)) {
  console.error('Possible secret-like token in render.yaml');
  process.exit(1);
}

console.log('render_yaml_structure_ok');
