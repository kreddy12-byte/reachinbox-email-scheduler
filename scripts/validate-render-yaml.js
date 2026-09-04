const fs = require('fs');

const text = fs.readFileSync('render.yaml', 'utf8');

const required = [
  'databases:',
  'name: reachinbox-db',
  'type: keyvalue',
  'name: reachinbox-redis',
  'type: pserv',
  'name: reachinbox-elasticsearch',
  'name: reachinbox-api',
  'name: reachinbox-worker',
  'name: reachinbox-frontend',
  'preDeployCommand: npx prisma migrate deploy',
  'startCommand: npm run worker:start',
  'staticPublishPath: dist',
  'VITE_API_URL',
  'ELASTICSEARCH_URL',
  'REDIS_URL',
  'DATABASE_URL',
  'sync: false',
];

for (const needle of required) {
  if (!text.includes(needle)) {
    console.error('MISSING:', needle);
    process.exit(1);
  }
  console.log('ok', needle);
}

if (/xoxb-[A-Za-z0-9]/i.test(text) || /sk_live_/i.test(text)) {
  console.error('Possible secret-like token in render.yaml');
  process.exit(1);
}

console.log('render_yaml_structure_ok');
