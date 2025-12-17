import fs from "fs";
import { ReasonStateAuto } from "../../src/api/auto.js";
import type { EchoState } from "../../src/engine/types.js";

/**
 * Debug script to trace the full flow:
 * 1. Node creation (raw ingestion)
 * 2. Structuring (edges, types, summaries)
 * 3. Context building
 * 4. What's sent to LLM for each QA
 */

interface QA {
  question: string;
  answer: string;
  evidence?: string[];
}

interface Sample {
  id: string;
  lines: string[];
  qas: QA[];
}

function loadDataset(filePath: string): Sample[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as any[];

  return (data as any[]).map((item, idx) => {
    const id = item.id ?? item.sample_id ?? `sample-${idx}`;
    const qas: QA[] = (item.qas ?? item.qa ?? []).map((q: any) => ({
      question: q.question ?? q.q ?? "",
      answer: q.answer ?? q.a ?? "",
      evidence: q.evidence || [],
    }));

    const lines: string[] = [];

    // Add session dates first
    if (item.conversation) {
      Object.keys(item.conversation).forEach((k) => {
        if (k.endsWith("_date_time") && item.conversation[k]) {
          lines.push(`Session date: ${item.conversation[k]}`);
        }
      });
    }

    // LoCoMo/LongMemEval: conversation has session_n arrays with turns containing text
    if (item.conversation) {
      Object.keys(item.conversation).forEach((k) => {
        if (k.startsWith("session") && Array.isArray(item.conversation[k])) {
          (item.conversation[k] as any[]).forEach((turn: any) => {
            if (turn?.text) lines.push(String(turn.text));
            else if (typeof turn === "string") lines.push(turn);
          });
        }
      });
    }

    return { id, lines, qas };
  });
}

function printNodeTree(state: EchoState, title: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`${title}`);
  console.log(`${"=".repeat(80)}\n`);

  const nodes = Object.values(state.raw ?? {});
  console.log(`Total nodes: ${nodes.length}\n`);

  // Group by type
  const byType: Record<string, typeof nodes> = {};
  nodes.forEach((n) => {
    const type = n.type || "unknown";
    if (!byType[type]) byType[type] = [];
    byType[type].push(n);
  });

  console.log("Nodes by type:");
  Object.entries(byType).forEach(([type, nodes]) => {
    console.log(`  ${type}: ${nodes.length}`);
  });

  // Show status distribution
  const byStatus: Record<string, typeof nodes> = {};
  nodes.forEach((n) => {
    const status = n.status || "open";
    if (!byStatus[status]) byStatus[status] = [];
    byStatus[status].push(n);
  });

  console.log("\nNodes by status:");
  Object.entries(byStatus).forEach(([status, nodes]) => {
    console.log(`  ${status}: ${nodes.length}`);
  });

  // Show edges in detail
  let totalEdges = 0;
  const edgesByType: Record<string, Array<{ from: string; to: string }>> = {
    dependsOn: [],
    contradicts: [],
    temporalAfter: [],
    temporalBefore: [],
    children: [],
  };
  
  nodes.forEach((n) => {
    if (n.dependsOn?.length) {
      totalEdges += n.dependsOn.length;
      n.dependsOn.forEach((to) => edgesByType.dependsOn.push({ from: n.id, to }));
    }
    if (n.contradicts?.length) {
      totalEdges += n.contradicts.length;
      n.contradicts.forEach((to) => edgesByType.contradicts.push({ from: n.id, to }));
    }
    if (n.temporalAfter?.length) {
      totalEdges += n.temporalAfter.length;
      n.temporalAfter.forEach((to) => edgesByType.temporalAfter.push({ from: n.id, to }));
    }
    if (n.temporalBefore?.length) {
      totalEdges += n.temporalBefore.length;
      n.temporalBefore.forEach((to) => edgesByType.temporalBefore.push({ from: n.id, to }));
    }
    if (n.children?.length) {
      totalEdges += n.children.length;
      n.children.forEach((to) => edgesByType.children.push({ from: n.id, to }));
    }
  });

  console.log(`\nTotal edges: ${totalEdges}`);
  if (totalEdges > 0) {
    console.log("\nEdges by type:");
    Object.entries(edgesByType).forEach(([type, edges]) => {
      if (edges.length > 0) {
        console.log(`  ${type}: ${edges.length}`);
        edges.slice(0, 5).forEach((e) => {
          const fromNode = nodes.find((n) => n.id === e.from);
          const toNode = nodes.find((n) => n.id === e.to);
          console.log(`    ${e.from} -> ${e.to}`);
          if (fromNode) console.log(`      from: "${(fromNode.summary || "").substring(0, 60)}..."`);
          if (toNode) console.log(`      to: "${(toNode.summary || "").substring(0, 60)}..."`);
        });
        if (edges.length > 5) console.log(`    ... and ${edges.length - 5} more`);
      }
    });
  }

  // Show sample nodes (first 5)
  console.log("\nSample nodes (first 5):");
  nodes.slice(0, 5).forEach((n) => {
    console.log(`\n  [${n.type}:${n.status || "open"}] ${n.id}`);
    console.log(`    Summary: ${(n.summary || "").substring(0, 100)}${n.summary && n.summary.length > 100 ? "..." : ""}`);
    if (n.dependsOn?.length) console.log(`    dependsOn: ${n.dependsOn.join(", ")}`);
    if (n.contradicts?.length) console.log(`    contradicts: ${n.contradicts.join(", ")}`);
    if (n.temporalAfter?.length) console.log(`    temporalAfter: ${n.temporalAfter.join(", ")}`);
    if (n.parentId) console.log(`    parentId: ${n.parentId}`);
    if (n.children?.length) console.log(`    children: ${n.children.join(", ")}`);
  });
}

async function main() {
  const datasetPath = process.argv[2] || "benchmarks/longmemeval/data/locomo-test.json";
  const sampleLimit = parseInt(process.argv[3] || "1");
  const qaLimit = parseInt(process.argv[4] || "3");

  console.log("Loading dataset...");
  const samples = loadDataset(datasetPath);
  const selectedSamples = samples.slice(0, sampleLimit);

  const apiKey = process.env.GROK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GROK_API_KEY or OPENAI_API_KEY not set");
    process.exit(1);
  }

  for (const sample of selectedSamples) {
    console.log(`\n${"#".repeat(80)}`);
    console.log(`# SAMPLE: ${sample.id}`);
    console.log(`# Total lines: ${sample.lines.length}, QAs: ${sample.qas.length}`);
    console.log(`${"#".repeat(80)}\n`);

    // Initialize ReasonStateAuto
    const rs = new ReasonStateAuto({
      apiKey,
      model: "grok-3-mini",
      baseUrl: process.env.GROK_API_KEY ? "https://api.x.ai/v1" : undefined,
    });

    // STEP 1: Add all lines (raw ingestion)
    console.log("\n[STEP 1] Adding lines to memory (raw ingestion)...");
    for (const line of sample.lines) {
      await rs.add(line);
    }

    // Get state after ingestion (before structuring)
    const stateAfterIngestion = (rs as any).rs.engine.snapshot as EchoState;
    printNodeTree(stateAfterIngestion, "[AFTER INGESTION] Raw nodes created");

    // STEP 2: Run structuring for first QA to see what happens
    const firstQA = sample.qas[0];
    console.log(`\n[STEP 2] Running structuring with goal: "${firstQA.question}"`);
    
    // Check unstructured IDs before structuring
    const unstructuredBefore = (rs as any).unstructuredIds.size;
    console.log(`  Unstructured nodes before: ${unstructuredBefore}`);
    
    const injectResult = await rs.inject(
      [{ role: "user", content: firstQA.question }],
      firstQA.question
    );

    const stateAfterStructuring = (rs as any).rs.engine.snapshot as EchoState;
    printNodeTree(stateAfterStructuring, "[AFTER STRUCTURING] Nodes with edges and types");
    
    console.log(`\n[STRUCTURING STATS]`);
    console.log(`  Structuring error: ${injectResult.stats.structuringError || false}`);
    console.log(`  Auto-heal attempts: ${injectResult.stats.autoHealAttempts || 0}`);
    console.log(`  Auto-heal rolled back: ${injectResult.stats.autoHealRolledBack || false}`);

    // Show what changed
    const beforeIds = new Set(Object.keys(stateAfterIngestion.raw ?? {}));
    const afterIds = new Set(Object.keys(stateAfterStructuring.raw ?? {}));
    const newNodes = Array.from(afterIds).filter((id) => !beforeIds.has(id));
    const modifiedNodes = Array.from(afterIds).filter((id) => {
      const before = stateAfterIngestion.raw?.[id];
      const after = stateAfterStructuring.raw?.[id];
      if (!before || !after) return false;
      return JSON.stringify(before) !== JSON.stringify(after);
    });

    console.log(`\n[STRUCTURING CHANGES]`);
    console.log(`  New nodes created: ${newNodes.length}`);
    if (newNodes.length > 0) {
      console.log(`    ${newNodes.slice(0, 5).join(", ")}${newNodes.length > 5 ? "..." : ""}`);
    }
    console.log(`  Modified nodes: ${modifiedNodes.length}`);
    
    // Show detailed changes for modified nodes
    if (modifiedNodes.length > 0) {
      console.log(`\n  Modified nodes details (first 10):`);
      modifiedNodes.slice(0, 10).forEach((id) => {
        const before = stateAfterIngestion.raw?.[id];
        const after = stateAfterStructuring.raw?.[id];
        if (!before || !after) return;
        
        const changes: string[] = [];
        if (before.type !== after.type) changes.push(`type: ${before.type} -> ${after.type}`);
        if (JSON.stringify(before.dependsOn || []) !== JSON.stringify(after.dependsOn || [])) {
          changes.push(`dependsOn: [${(before.dependsOn || []).join(", ")}] -> [${(after.dependsOn || []).join(", ")}]`);
        }
        if (JSON.stringify(before.temporalAfter || []) !== JSON.stringify(after.temporalAfter || [])) {
          changes.push(`temporalAfter: [${(before.temporalAfter || []).join(", ")}] -> [${(after.temporalAfter || []).join(", ")}]`);
        }
        if (JSON.stringify(before.contradicts || []) !== JSON.stringify(after.contradicts || [])) {
          changes.push(`contradicts: [${(before.contradicts || []).join(", ")}] -> [${(after.contradicts || []).join(", ")}]`);
        }
        if (before.status !== after.status) changes.push(`status: ${before.status} -> ${after.status}`);
        
        if (changes.length > 0) {
          console.log(`    ${id}: ${changes.join(", ")}`);
          console.log(`      "${(after.summary || "").substring(0, 80)}..."`);
        }
      });
      if (modifiedNodes.length > 10) {
        console.log(`    ... and ${modifiedNodes.length - 10} more modified nodes`);
      }
    }

    // STEP 3: Show context for each QA
    const qasToTest = sample.qas.slice(0, qaLimit);
    for (let i = 0; i < qasToTest.length; i++) {
      const qa = qasToTest[i];
      console.log(`\n${"-".repeat(80)}`);
      console.log(`[QA ${i + 1}/${qasToTest.length}] Question: "${qa.question}"`);
      console.log(`Ground truth: "${qa.answer}"`);
      console.log(`${"-".repeat(80)}\n`);

      const retrieveResult = await rs.retrieve(qa.question);
      const context = retrieveResult.context;

      console.log(`[CONTEXT BUILT]`);
      console.log(`  Length: ${context.length} chars (~${Math.ceil(context.length / 4)} tokens)`);
      console.log(`  Stats:`, retrieveResult.stats);
      console.log(`\n[CONTEXT PREVIEW] (first 1000 chars):`);
      console.log(context.substring(0, 1000));
      if (context.length > 1000) {
        console.log(`\n... (${context.length - 1000} more chars)`);
      }

      // Check if answer is in context
      const answerStr = String(qa.answer);
      const answerInContext = context.toLowerCase().includes(answerStr.toLowerCase());
      console.log(`\n[ANSWER CHECK]`);
      console.log(`  Answer "${qa.answer}" in context: ${answerInContext ? "✅ YES" : "❌ NO"}`);

      // Show which nodes are included
      const nodeIdsInContext = new Set<string>();
      Object.keys(stateAfterStructuring.raw ?? {}).forEach((id) => {
        if (context.includes(id)) {
          nodeIdsInContext.add(id);
        }
      });
      console.log(`  Nodes referenced in context: ${nodeIdsInContext.size}`);
      if (nodeIdsInContext.size > 0) {
        console.log(`    ${Array.from(nodeIdsInContext).slice(0, 10).join(", ")}${nodeIdsInContext.size > 10 ? "..." : ""}`);
      }
    }
  }
}

main().catch(console.error);

