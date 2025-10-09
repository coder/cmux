#!/usr/bin/env node
/**
 * Chrome Performance Trace Analyzer
 * 
 * Usage: node scripts/analyze-trace.js <path-to-trace.json>
 * 
 * Provides quick analysis of Chrome performance traces:
 * - Long tasks that cause jank (>50ms)
 * - Category breakdown
 * - Main thread activity
 * - React-specific performance issues
 */

const fs = require('fs');
const path = require('path');

function analyzeTrace(traceFile) {
  console.log(`Analyzing: ${traceFile}`);
  console.log(`Size: ${(fs.statSync(traceFile).size / 1024 / 1024).toFixed(2)} MB\n`);

  const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
  const events = trace.traceEvents || trace;

  // Find main renderer thread
  const mainThreadEvent = events.find(
    e => e.name === 'thread_name' && e.args?.name === 'CrRendererMain'
  );
  const mainTid = mainThreadEvent?.tid;
  const mainPid = mainThreadEvent?.pid;

  // Time range
  const timestamps = events.filter(e => e.ts).map(e => e.ts);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);
  const durationSec = ((maxTs - minTs) / 1000000).toFixed(2);

  console.log('=== TRACE INFO ===\n');
  console.log(`Duration: ${durationSec}s`);
  console.log(`Total events: ${events.length}`);
  console.log(`Main thread PID: ${mainPid}, TID: ${mainTid}\n`);

  // Long tasks (>50ms on main thread)
  const longTasks = events
    .filter(e => e.dur && e.dur > 50000 && (!mainTid || e.tid === mainTid))
    .map(e => ({
      name: e.name,
      duration: (e.dur / 1000).toFixed(2),
      timestamp: e.ts,
      relativeTime: ((e.ts - minTs) / 1000000).toFixed(2),
      category: e.cat,
      functionName: e.args?.data?.functionName,
      url: e.args?.data?.url,
      scriptUrl: e.args?.data?.scriptUrl,
    }))
    .sort((a, b) => parseFloat(b.duration) - parseFloat(a.duration));

  console.log(`=== LONG TASKS (>50ms) - ${longTasks.length} found ===\n`);
  longTasks.slice(0, 15).forEach((task, i) => {
    console.log(`${i + 1}. ${task.name} - ${task.duration}ms (at ${task.relativeTime}s)`);
    if (task.functionName) console.log(`   Function: ${task.functionName}`);
    if (task.url) {
      const shortUrl = task.url.replace(/http:\/\/localhost:\d+/, '');
      console.log(`   URL: ${shortUrl}`);
    }
    console.log('');
  });

  // Category analysis
  const byCategory = {};
  events.forEach(e => {
    if (!e.dur) return;
    const cat = e.cat || 'unknown';
    if (!byCategory[cat]) {
      byCategory[cat] = { count: 0, totalDuration: 0 };
    }
    byCategory[cat].count++;
    byCategory[cat].totalDuration += e.dur;
  });

  console.log('=== CATEGORY TIME BREAKDOWN ===\n');
  Object.entries(byCategory)
    .sort(([, a], [, b]) => b.totalDuration - a.totalDuration)
    .slice(0, 10)
    .forEach(([cat, data]) => {
      console.log(`${cat.padEnd(50)} ${(data.totalDuration / 1000).toFixed(2).padStart(10)}ms (${data.count} events)`);
    });

  // React-specific analysis
  const reactTasks = longTasks.filter(
    t => t.functionName?.includes('perform') || 
         t.functionName?.includes('Work') ||
         t.url?.includes('react') ||
         t.url?.includes('chunk-KD5O2VVB')
  );

  if (reactTasks.length > 0) {
    console.log(`\n=== REACT PERFORMANCE ISSUES - ${reactTasks.length} long React tasks ===\n`);
    reactTasks.slice(0, 10).forEach((task, i) => {
      console.log(`${i + 1}. ${task.functionName || task.name} - ${task.duration}ms`);
    });
  }

  // Recommendations
  console.log('\n=== RECOMMENDATIONS ===\n');
  
  if (longTasks.length > 5) {
    console.log(`⚠️  Found ${longTasks.length} long tasks (>50ms). These cause jank/stuttering.`);
    console.log('   Target: Keep all tasks under 50ms for 60fps\n');
  }

  if (reactTasks.length > 0) {
    console.log('⚠️  React scheduler tasks are taking >50ms. Consider:');
    console.log('   - Use React.memo() to prevent unnecessary re-renders');
    console.log('   - Virtualize long lists (react-window, react-virtualized)');
    console.log('   - Split large components into smaller chunks');
    console.log('   - Use useMemo() for expensive computations');
    console.log('   - Check for infinite render loops\n');
  }

  console.log('📊 For detailed visual analysis:');
  console.log('   1. Open Chrome and go to: chrome://tracing');
  console.log('   2. Click "Load" and select your trace file');
  console.log('   3. Use WASD to navigate, ? for help\n');

  console.log('🔍 For React-specific profiling:');
  console.log('   1. Install React DevTools extension');
  console.log('   2. Open DevTools > Profiler tab');
  console.log('   3. Record a session and analyze component render times\n');
}

// Main
const traceFile = process.argv[2];
if (!traceFile) {
  console.error('Usage: node scripts/analyze-trace.js <trace-file.json>');
  console.error('\nQuick find latest trace:');
  console.error('  node scripts/analyze-trace.js $(ls -t ~/Downloads/Trace*.json | head -1)');
  process.exit(1);
}

if (!fs.existsSync(traceFile)) {
  console.error(`Error: File not found: ${traceFile}`);
  process.exit(1);
}

analyzeTrace(traceFile);
