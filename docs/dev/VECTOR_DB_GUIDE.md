# Vector Database & Regulations Retrieval System

## Overview

The current support chatbot operates with a static system prompt containing AR 623-3 knowledge. To scale this and make regulations more accessible, we'll implement **vector embeddings** with **Retrieval-Augmented Generation (RAG)**.

**Why?** The support bot can then search actual PDF documents (AR 623-3, DA PAM 623-3, policy memos) in real-time, providing accurate citations and up-to-date guidance instead of hallucinating.

## Architecture Options

### Option 1: PostgreSQL + pgvector (Recommended for MVP)
**Pros:**
- Already have PostgreSQL (Supabase)
- No additional infrastructure
- Supabase supports pgvector extension
- Simple vector search via SQL

**Cons:**
- Limited vector optimization (vs. dedicated services)
- Manual embedding generation & management

**Timeline:** 1-2 days

**Cost:** Free tier of Supabase

---

### Option 2: Pinecone (Best for Production)
**Pros:**
- Fully managed, serverless
- Scales automatically
- Namespace-based multi-tenancy (future: per-unit or per-rank access)
- Native integration with LangChain

**Cons:**
- SaaS pricing (~$0.10/1K queries + storage)
- External dependency

**Timeline:** 1 day

**Cost:** ~$20-100/month at scale

---

### Option 3: Weaviate (Open-source alternative)
**Pros:**
- Self-hosted or managed cloud
- GraphQL + REST API
- Good for on-prem scenarios

**Cons:**
- Requires DevOps overhead for self-hosting
- Managed tier pricing similar to Pinecone

**Timeline:** 2-3 days

**Cost:** $0-500/month (depends on deployment)

---

## Implementation Plan: PostgreSQL + pgvector (MVP)

### Step 1: Enable pgvector in Supabase

1. **Via Supabase Dashboard:**
   - SQL Editor → New Query
   - Run:
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```

2. **Or via Prisma (recommended):**
   ```sql
   -- In prisma/schema.prisma, add:
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
     extensions = ["vector"]
   }
   ```
   Then:
   ```bash
   npx prisma migrate dev --name add_pgvector
   ```

### Step 2: Create Regulations Table in Prisma

```prisma
model RegulationDocument {
  id            String    @id @default(cuid())
  title         String    // "AR 623-3", "DA PAM 623-3", "Local SOP"
  category      String    // "EVALUATION", "COUNSELING", "POLICY"
  section       String?   // "§5.3", "Chapter 2"
  content       String    // Full text or excerpt
  embedding     Vector?   @db.Vector(1536)  // OpenAI ada-002 dimension
  source        String?   // "https://armypubs.army.mil/..."
  effectiveDate DateTime?
  expiryDate    DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@fulltext([title, content])  // Full-text search fallback
}

model EmbeddingCache {
  id        String   @id @default(cuid())
  hash      String   @unique  // SHA256 hash of input
  vector    Vector   @db.Vector(1536)
  model     String   // "text-embedding-ada-002"
  createdAt DateTime @default(now())
}
```

### Step 3: Generate & Store Embeddings

Create `/src/lib/regulations/embedding.ts`:

```typescript
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { prisma } from "@/lib/prisma";

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"), // 512D, cheaper
    value: text,
  });
  return embedding;
}

export async function indexRegulation(regulation: {
  title: string;
  category: string;
  section?: string;
  content: string;
  source?: string;
}) {
  const embedding = await embedText(
    `${regulation.title} ${regulation.section || ""} ${regulation.content}`.slice(
      0,
      2000,
    ), // Limit input
  );

  return prisma.regulationDocument.create({
    data: {
      ...regulation,
      embedding,
    },
  });
}

export async function searchRegulations(
  query: string,
  limit: number = 5,
): Promise<RegulationDocument[]> {
  const queryEmbedding = await embedText(query);

  // Vector similarity search
  const results = await prisma.$queryRaw<RegulationDocument[]>`
    SELECT id, title, category, section, content, source
    FROM "RegulationDocument"
    ORDER BY embedding <-> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${limit}
  `;

  return results;
}
```

### Step 4: Seed Initial Regulations

Create `/src/lib/regulations/seed.ts`:

```typescript
import { indexRegulation } from "./embedding";

// Initial regulations to index
const REGULATIONS = [
  {
    title: "AR 623-3",
    category: "EVALUATION",
    section: "Chapter 1 - General",
    content:
      "The Army NCO Evaluation Report (NCOER) is the primary tool for rating and evaluating NCO performance. [Full text here...]",
    source:
      "https://armypubs.army.mil/epubs/DR_pubs/DR_a/pdf/web/ARN2070_AR623_3_Final_13-10.pdf",
  },
  // ... more regulations
];

export async function seedRegulations() {
  for (const reg of REGULATIONS) {
    try {
      await indexRegulation(reg);
    } catch (err) {
      console.error(`Failed to seed ${reg.title}:`, err);
    }
  }
  console.log(`Seeded ${REGULATIONS.length} regulations`);
}
```

### Step 5: Integrate with Support Chat

Update `/src/routes/support.ts`:

```typescript
import { searchRegulations } from "@/lib/regulations/embedding";

apiRouter.post("/support/chat", async (req, res) => {
  const { messages } = req.body;
  const lastMessage = messages[messages.length - 1].content;

  // Search for relevant regulations
  const relevantDocs = await searchRegulations(lastMessage, 3);

  const systemPrompt = `
You are the EES 2.0 Support Assistant, trained on Army Regulations.

CONTEXT: AR 623-3, DA PAM 623-3, and EES policy documentation.

USER QUERY: "${lastMessage}"

RELEVANT REGULATIONS:
${relevantDocs.map((doc) => `\n**${doc.title} - ${doc.section}:**\n${doc.content}`).join("\n")}

Always cite the regulation or section number when answering.
  `;

  // Continue with OpenAI call using enhanced systemPrompt...
});
```

---

## Implementation Roadmap

### Phase 1: MVP (Week 1)
- Enable pgvector in Supabase
- Create Prisma schema
- Index AR 623-3 + DA PAM 623-3 PDFs (~20 key sections)
- Integrate into support bot
- **Timeline:** 1-2 days

### Phase 2: Advanced Search (Week 2)
- Add full-text search fallback
- Implement semantic search with filters (category, date range)
- User feedback loop (log queries, track helpful results)
- **Timeline:** 2-3 days

### Phase 3: Multi-tenant Access Control (Week 3)
- Add `RegulationAccess` table (role-based access to specific docs)
- Implement access checks in search queries
- Support "Private SOP" documents per unit
- **Timeline:** 1-2 days

### Phase 4: Production Scale (Month 2)
- Migrate to Pinecone for higher throughput
- Implement caching layer (Redis)
- Set up automated PDF ingestion pipeline
- Add OCR for image-based regulations
- **Timeline:** 1 week

---

## Cost Comparison

| Service        | MVP Cost | Production Cost | Setup Time |
| -------------- | -------- | --------------- | ---------- |
| pgvector       | Free     | Free            | 1 day      |
| Pinecone       | $0.10/Q  | ~$50-100/mo     | 1 day      |
| Weaviate (OSS) | Free     | $0-500/mo       | 2-3 days   |
| LangChain+DB   | Free     | Included        | 1 day      |

---

## Quick Start: pgvector Implementation

```bash
# 1. Enable extension in Supabase
# Already done via schema with prisma/schema.prisma extensions

# 2. Run migration
cd ees2-backend
npx prisma migrate dev --name add_regulations_vector

# 3. Seed regulations
# Add to src/index.ts:
import { seedRegulations } from "@/lib/regulations/seed";
seedRegulations().catch(console.error);

# 4. Update support route with RAG integration
# (See Step 5 above)
```

---

## Data Sources for AR 623-3

| Source | URL | Format | Free |
| ------ | --- | ------ | ---- |
| Army Publications | https://armypubs.army.mil | PDF | Yes |
| AKO SharePoint | https://www.us.army.mil | Requires CAC | Yes* |
| AI Doc Generator | Generate from official text | Markdown | Yes |

---

## Advanced: Using LangChain + OpenAI Assistants

For a more sophisticated approach, consider **OpenAI Assistants API** which handles embeddings + retrieval automatically:

```typescript
import { OpenAI } from "openai";

const client = new OpenAI();

// Upload regulation PDFs
const file = await client.beta.files.upload({
  file: fs.createReadStream("AR_623-3.pdf"),
  purpose: "assistants",
});

// Create assistant with file
const assistant = await client.beta.assistants.create({
  name: "EES Regulations Assistant",
  instructions: "You are an expert on Army regulations...",
  tools: [{ type: "retrieval" }],
  model: "gpt-4-turbo-preview",
  file_ids: [file.id],
});
```

This offloads embedding & retrieval to OpenAI but reduces customization.

---

## Next Steps

1. **Decide:** pgvector (fast, free MVP) or Pinecone (production-ready)?
2. **Index:** Prepare AR 623-3, DA PAM 623-3 content (extract sections)
3. **Test:** Create `/api/dev/search-regulations` endpoint for debugging
4. **Deploy:** Integrate into support bot on dev environment
5. **Iterate:** Collect user feedback on answer quality

---

## Questions?

- **How do I extract text from PDFs?** Use `pdf-parse` or `pdfjs-dist` npm packages
- **Can soldiers upload their own docs?** Yes, add file upload to `/regulations/upload` route (authenticated)
- **How do I track what soldiers are searching?** Log to `RegulationQuery` table with timestamps & user ID
- **Do I need to re-embed when regulations update?** Yes, create a job to update embeddings daily or on-demand
