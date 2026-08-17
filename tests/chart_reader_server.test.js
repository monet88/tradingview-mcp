import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createChartReaderServer } from '../src/chart-reader-server.js';

describe('Chart Reader Server Factory (Ticket 01)', () => {
  it('creates an MCP server with ChatGPT-oriented tools and without tv_launch', async () => {
    const server = createChartReaderServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);

      // Must include key chart-reader tools
      assert.ok(toolNames.includes('tv_health_check'), 'includes tv_health_check');
      assert.ok(toolNames.includes('tv_discover'), 'includes tv_discover');
      assert.ok(toolNames.includes('tv_ui_state'), 'includes tv_ui_state');
      assert.ok(toolNames.includes('tv_update'), 'includes tv_update');
      assert.ok(toolNames.includes('chart_get_state'), 'includes chart_get_state');
      assert.ok(toolNames.includes('chart_set_symbol'), 'includes chart_set_symbol');
      assert.ok(toolNames.includes('chart_snapshot_state'), 'includes chart_snapshot_state');
      assert.ok(toolNames.includes('chart_restore_state'), 'includes chart_restore_state');
      assert.ok(toolNames.includes('capture_screenshot'), 'includes capture_screenshot');
      assert.ok(toolNames.includes('data_get_study_values'), 'includes data_get_study_values');
      assert.ok(toolNames.includes('quote_get'), 'includes quote_get');

      // Every ChatGPT-facing tool advertises structured output metadata.
      for (const tool of toolsResult.tools) {
        assert.equal(tool.outputSchema?.type, 'object', tool.name + ' has object outputSchema');
        assert.equal(tool.outputSchema?.properties?.success?.type, 'boolean', tool.name + ' describes success');
      }

      const toolsByName = Object.fromEntries(toolsResult.tools.map((tool) => [tool.name, tool]));
      assert.equal(toolsByName.chart_get_state.outputSchema.properties.symbol.type, 'string');
      assert.equal(toolsByName.data_get_ohlcv.outputSchema.properties.bars.type, 'array');
      assert.equal(toolsByName.pane_list.outputSchema.properties.panes.type, 'array');
      assert.equal(toolsByName.chart_snapshot_state.outputSchema.properties.snapshot.type, 'object');
      assert.equal(toolsByName.capture_screenshot.outputSchema.properties.method.type, 'string');
      // Must NOT include tv_launch
      assert.equal(toolNames.includes('tv_launch'), false, 'must NOT include tv_launch');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('tv_health_check returns manual lifecycle guidance when CDP is unavailable', async () => {
    const server = createChartReaderServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const result = await client.callTool({ name: 'tv_health_check', arguments: {} });
      const textItem = result.content?.find((c) => c.type === 'text');
      assert.ok(textItem, 'text content returned');
      const data = JSON.parse(textItem.text);
      assert.deepEqual(result.structuredContent, data, 'structuredContent matches JSON text content');
      if (!data.success) {
        assert.ok(data.hint, 'contains a hint');
        assert.doesNotMatch(data.hint, /tv_launch/, 'hint must not instruct caller to use tv_launch');
        assert.match(data.hint, /manually/i, 'hint instructs caller to open TradingView manually');
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('isolates chart snapshot and restore state between different server instances', async () => {
    const server1 = createChartReaderServer();
    const server2 = createChartReaderServer();

    const [c1Transport, s1Transport] = InMemoryTransport.createLinkedPair();
    const [c2Transport, s2Transport] = InMemoryTransport.createLinkedPair();

    const client1 = new Client({ name: 'client-1', version: '1.0.0' });
    const client2 = new Client({ name: 'client-2', version: '1.0.0' });

    await Promise.all([
      server1.connect(s1Transport),
      client1.connect(c1Transport),
      server2.connect(s2Transport),
      client2.connect(c2Transport),
    ]);

    try {
      // Calling restore on client1 with no snapshot returns error
      const r1 = await client1.callTool({ name: 'chart_restore_state', arguments: {} });
      const r1Data = JSON.parse(r1.content[0].text);
      assert.equal(r1Data.success, false);
      assert.match(r1Data.error, /No chart snapshot exists/i);

      // Calling restore on client2 with no snapshot returns error
      const r2 = await client2.callTool({ name: 'chart_restore_state', arguments: {} });
      const r2Data = JSON.parse(r2.content[0].text);
      assert.equal(r2Data.success, false);
      assert.match(r2Data.error, /No chart snapshot exists/i);
    } finally {
      await client1.close();
      await server1.close();
      await client2.close();
      await server2.close();
    }
  });
});
