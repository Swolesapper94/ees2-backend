const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL.replace('?schema=public&pgbouncer=true&connection_limit=20', ''),
});

(async () => {
  try {
    await client.connect();
    console.log('Creating _prisma_migrations table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        id SERIAL PRIMARY KEY,
        checksum VARCHAR(64) NOT NULL UNIQUE,
        finished_at TIMESTAMP,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        logs TEXT,
        rolled_back_at TIMESTAMP,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        applied_steps_count INTEGER NOT NULL DEFAULT 0
      );
    `);
    
    console.log('✅ _prisma_migrations table created');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await client.end();
  }
})();
