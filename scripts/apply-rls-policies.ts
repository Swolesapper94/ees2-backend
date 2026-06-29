#!/usr/bin/env npx ts-node
/**
 * Apply RLS policies to all EES 2.0 tables
 * Usage: npm run apply-rls-policies
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function applyRLSPolicies() {
  try {
    console.log('📋 Reading RLS policies from supabase/rls-policies.sql...');
    
    const sqlPath = path.join(__dirname, '..', 'supabase', 'rls-policies.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    
    // Split by semicolon and filter out comments and empty statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter((stmt): stmt is string => Boolean(stmt && !stmt.startsWith('--')));
    
    console.log(`✅ Found ${statements.length} SQL statements to execute`);
    console.log('🚀 Applying RLS policies...\n');
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;
      
      try {
        console.log(`[${i + 1}/${statements.length}] Executing...`);
        await prisma.$executeRawUnsafe(statement);
        console.log(`✓ Success\n`);
      } catch (error: any) {
        console.error(`✗ Error: ${error.message}\n`);
        throw error;
      }
    }
    
    console.log('✨ All RLS policies applied successfully!');
    
  } catch (error) {
    console.error('❌ Failed to apply RLS policies:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyRLSPolicies();
