#!/usr/bin/env npx tsx
/**
 * Debug script to trace why camping node isn't appearing in context.
 * This tests just the retrieval logic without running the full benchmark.
 */

import { ReasonStateAuto } from "./src/api/auto.js";
import { readFileSync } from "fs";

// Enable debug logging
process.env.DEBUG_CONTEXT = "1";

async function main() {
  console.log("=== DEBUGGING CAMPING NODE RETRIEVAL ===\n");

  // Load the test dataset
  const data = JSON.parse(
    readFileSync("benchmarks/longmemeval/data/locomo-test.json", "utf-8")
  );
  const sample = data[0];
  const qa7 = sample.qa.find((qa: any) => qa.question.includes("camping"));

  if (!qa7) {
    console.error("QA 7 (camping) not found in dataset");
    process.exit(1);
  }

  console.log(`Question: "${qa7.question}"`);
  console.log(`Expected answer: "${qa7.answer}"\n`);

  // Initialize ReasonStateAuto
  const rs = new ReasonStateAuto({
    apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
    model: process.env.GROQ_API_KEY ? "grok-3-mini" : "gpt-4o-mini",
    baseUrl: process.env.GROQ_API_KEY
      ? "https://api.x.ai/v1"
      : undefined,
    maxTokens: 4000,
  });

  // Add all conversation lines
  console.log("Adding conversation lines...");
  const conversation = sample.conversation;
  const allLines: string[] = [];

  // Add session dates
  if (conversation.session_1_date_time) {
    allLines.push(`Session date: ${conversation.session_1_date_time}`);
  }
  if (conversation.session_2_date_time) {
    allLines.push(`Session date: ${conversation.session_2_date_time}`);
  }
  if (conversation.session_3_date_time) {
    allLines.push(`Session date: ${conversation.session_3_date_time}`);
  }

  // Add conversation lines
  for (const session of [
    conversation.session_1,
    conversation.session_2,
    conversation.session_3,
  ]) {
    if (Array.isArray(session)) {
      for (const turn of session) {
        if (turn.text) {
          allLines.push(turn.text);
        }
      }
    }
  }

  console.log(`Adding ${allLines.length} lines...`);
  for (const line of allLines) {
    await rs.add(line);
  }

  // Find the camping node
  const state = (rs as any).rs.engine.snapshot;
  const allNodes = Object.values(state.raw ?? {});
  const campingNode = allNodes.find(
    (n: any) =>
      n.summary?.toLowerCase().includes("camping") ||
      (n.details as any)?.text?.toLowerCase().includes("camping") ||
      n.summary?.toLowerCase().includes("next month")
  );

  if (campingNode) {
    console.log(`\n✅ Found camping node: ${campingNode.id}`);
    console.log(`   Summary: ${campingNode.summary?.substring(0, 100)}`);
    console.log(`   Details: ${(campingNode.details as any)?.text?.substring(0, 100)}`);
    console.log(`   Status: ${campingNode.status ?? "undefined"}`);
    console.log(`   Type: ${campingNode.type}`);
    console.log(`   Edges: dependsOn=${campingNode.dependsOn?.length ?? 0}, temporalAfter=${(campingNode as any).temporalAfter?.length ?? 0}`);
  } else {
    console.log("\n❌ Camping node not found in state!");
    process.exit(1);
  }

  // Trigger structuring with first QA (like benchmark does)
  const firstQA = sample.qa[0];
  console.log(`\n=== Triggering structuring with first QA ===`);
  console.log(`Question: "${firstQA.question}"`);
  try {
    await rs.inject([{ role: "user", content: firstQA.question }], firstQA.question);
  } catch (error) {
    console.log(`⚠️  Structuring failed (continuing anyway): ${error}`);
  }

  // Check camping node after structuring
  const stateAfterStructuring = (rs as any).rs.engine.snapshot;
  const campingNodeAfter = stateAfterStructuring.raw?.[campingNode.id];
  console.log(`\n=== After structuring ===`);
  console.log(`Camping node edges: dependsOn=${campingNodeAfter?.dependsOn?.length ?? 0}, temporalAfter=${(campingNodeAfter as any)?.temporalAfter?.length ?? 0}`);

  // Now test retrieval for QA 7
  console.log(`\n=== Testing retrieval for QA 7 ===`);
  console.log(`Question: "${qa7.question}"`);
  
  const result = await rs.retrieve(qa7.question);
  const context = result.context;

  console.log(`\n=== Context Analysis ===`);
  console.log(`Context length: ${context.length} chars`);
  console.log(`Contains "camping": ${context.toLowerCase().includes("camping")}`);
  console.log(`Contains "next month": ${context.toLowerCase().includes("next month")}`);
  console.log(`Contains camping node ID: ${context.includes(campingNode.id)}`);

  // Check if camping node is in vector matches section
  const vectorMatchesSection = context.match(/## Vector matches\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (vectorMatchesSection) {
    const vectorMatchesContent = vectorMatchesSection[1];
    console.log(`\n=== Vector Matches Section ===`);
    console.log(`Length: ${vectorMatchesContent.length} chars`);
    console.log(`Contains camping node: ${vectorMatchesContent.includes(campingNode.id)}`);
    console.log(`Contains "camping": ${vectorMatchesContent.toLowerCase().includes("camping")}`);
    
    // Count nodes in vector matches
    const nodeMatches = vectorMatchesContent.match(/- \w+:/g);
    console.log(`Number of nodes in Vector matches: ${nodeMatches?.length ?? 0}`);
    
    // Show first few nodes
    const lines = vectorMatchesContent.split("\n").filter(l => l.trim().startsWith("-"));
    console.log(`\nFirst 10 nodes in Vector matches:`);
    lines.slice(0, 10).forEach((line, i) => {
      const hasCamping = line.toLowerCase().includes("camping") || line.toLowerCase().includes("next month");
      console.log(`  ${i + 1}. ${line.substring(0, 100)}${hasCamping ? " ⭐ CAMPING" : ""}`);
    });
  } else {
    console.log(`\n❌ Vector matches section not found in context!`);
  }

  // Show full context (truncated for readability)
  console.log(`\n=== Full Context (first 2000 chars) ===`);
  console.log(context.substring(0, 2000));
  if (context.length > 2000) {
    console.log(`\n... (${context.length - 2000} more chars)`);
  }
}

main().catch(console.error);


 * Debug script to trace why camping node isn't appearing in context.
 * This tests just the retrieval logic without running the full benchmark.
 */

import { ReasonStateAuto } from "./src/api/auto.js";
import { readFileSync } from "fs";

// Enable debug logging
process.env.DEBUG_CONTEXT = "1";

async function main() {
  console.log("=== DEBUGGING CAMPING NODE RETRIEVAL ===\n");

  // Load the test dataset
  const data = JSON.parse(
    readFileSync("benchmarks/longmemeval/data/locomo-test.json", "utf-8")
  );
  const sample = data[0];
  const qa7 = sample.qa.find((qa: any) => qa.question.includes("camping"));

  if (!qa7) {
    console.error("QA 7 (camping) not found in dataset");
    process.exit(1);
  }

  console.log(`Question: "${qa7.question}"`);
  console.log(`Expected answer: "${qa7.answer}"\n`);

  // Initialize ReasonStateAuto
  const rs = new ReasonStateAuto({
    apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
    model: process.env.GROQ_API_KEY ? "grok-3-mini" : "gpt-4o-mini",
    baseUrl: process.env.GROQ_API_KEY
      ? "https://api.x.ai/v1"
      : undefined,
    maxTokens: 4000,
  });

  // Add all conversation lines
  console.log("Adding conversation lines...");
  const conversation = sample.conversation;
  const allLines: string[] = [];

  // Add session dates
  if (conversation.session_1_date_time) {
    allLines.push(`Session date: ${conversation.session_1_date_time}`);
  }
  if (conversation.session_2_date_time) {
    allLines.push(`Session date: ${conversation.session_2_date_time}`);
  }
  if (conversation.session_3_date_time) {
    allLines.push(`Session date: ${conversation.session_3_date_time}`);
  }

  // Add conversation lines
  for (const session of [
    conversation.session_1,
    conversation.session_2,
    conversation.session_3,
  ]) {
    if (Array.isArray(session)) {
      for (const turn of session) {
        if (turn.text) {
          allLines.push(turn.text);
        }
      }
    }
  }

  console.log(`Adding ${allLines.length} lines...`);
  for (const line of allLines) {
    await rs.add(line);
  }

  // Find the camping node
  const state = (rs as any).rs.engine.snapshot;
  const allNodes = Object.values(state.raw ?? {});
  const campingNode = allNodes.find(
    (n: any) =>
      n.summary?.toLowerCase().includes("camping") ||
      (n.details as any)?.text?.toLowerCase().includes("camping") ||
      n.summary?.toLowerCase().includes("next month")
  );

  if (campingNode) {
    console.log(`\n✅ Found camping node: ${campingNode.id}`);
    console.log(`   Summary: ${campingNode.summary?.substring(0, 100)}`);
    console.log(`   Details: ${(campingNode.details as any)?.text?.substring(0, 100)}`);
    console.log(`   Status: ${campingNode.status ?? "undefined"}`);
    console.log(`   Type: ${campingNode.type}`);
    console.log(`   Edges: dependsOn=${campingNode.dependsOn?.length ?? 0}, temporalAfter=${(campingNode as any).temporalAfter?.length ?? 0}`);
  } else {
    console.log("\n❌ Camping node not found in state!");
    process.exit(1);
  }

  // Trigger structuring with first QA (like benchmark does)
  const firstQA = sample.qa[0];
  console.log(`\n=== Triggering structuring with first QA ===`);
  console.log(`Question: "${firstQA.question}"`);
  try {
    await rs.inject([{ role: "user", content: firstQA.question }], firstQA.question);
  } catch (error) {
    console.log(`⚠️  Structuring failed (continuing anyway): ${error}`);
  }

  // Check camping node after structuring
  const stateAfterStructuring = (rs as any).rs.engine.snapshot;
  const campingNodeAfter = stateAfterStructuring.raw?.[campingNode.id];
  console.log(`\n=== After structuring ===`);
  console.log(`Camping node edges: dependsOn=${campingNodeAfter?.dependsOn?.length ?? 0}, temporalAfter=${(campingNodeAfter as any)?.temporalAfter?.length ?? 0}`);

  // Now test retrieval for QA 7
  console.log(`\n=== Testing retrieval for QA 7 ===`);
  console.log(`Question: "${qa7.question}"`);
  
  const result = await rs.retrieve(qa7.question);
  const context = result.context;

  console.log(`\n=== Context Analysis ===`);
  console.log(`Context length: ${context.length} chars`);
  console.log(`Contains "camping": ${context.toLowerCase().includes("camping")}`);
  console.log(`Contains "next month": ${context.toLowerCase().includes("next month")}`);
  console.log(`Contains camping node ID: ${context.includes(campingNode.id)}`);

  // Check if camping node is in vector matches section
  const vectorMatchesSection = context.match(/## Vector matches\n([\s\S]*?)(?=\n##|\n$|$)/);
  if (vectorMatchesSection) {
    const vectorMatchesContent = vectorMatchesSection[1];
    console.log(`\n=== Vector Matches Section ===`);
    console.log(`Length: ${vectorMatchesContent.length} chars`);
    console.log(`Contains camping node: ${vectorMatchesContent.includes(campingNode.id)}`);
    console.log(`Contains "camping": ${vectorMatchesContent.toLowerCase().includes("camping")}`);
    
    // Count nodes in vector matches
    const nodeMatches = vectorMatchesContent.match(/- \w+:/g);
    console.log(`Number of nodes in Vector matches: ${nodeMatches?.length ?? 0}`);
    
    // Show first few nodes
    const lines = vectorMatchesContent.split("\n").filter(l => l.trim().startsWith("-"));
    console.log(`\nFirst 10 nodes in Vector matches:`);
    lines.slice(0, 10).forEach((line, i) => {
      const hasCamping = line.toLowerCase().includes("camping") || line.toLowerCase().includes("next month");
      console.log(`  ${i + 1}. ${line.substring(0, 100)}${hasCamping ? " ⭐ CAMPING" : ""}`);
    });
  } else {
    console.log(`\n❌ Vector matches section not found in context!`);
  }

  // Show full context (truncated for readability)
  console.log(`\n=== Full Context (first 2000 chars) ===`);
  console.log(context.substring(0, 2000));
  if (context.length > 2000) {
    console.log(`\n... (${context.length - 2000} more chars)`);
  }
}

main().catch(console.error);

