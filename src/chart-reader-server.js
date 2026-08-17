import { readFileSync } from 'fs';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { evaluate } from './connection.js';
import { jsonResult } from './tools/_format.js';
import { createOutputSchemaToolRegistrar } from './tools/_output.js';
import { registerHealthTools } from './tools/health.js';
import { registerChartTools } from './tools/chart.js';
import { registerDataTools } from './tools/data.js';
import { registerPaneTools } from './tools/pane.js';
import * as chartCore from './core/chart.js';
import * as capture from './core/capture.js';

export function createChartReaderServer(options = {}) {
  let savedChartState = null;

  async function getLogicalRange() {
    return evaluate(`(() => {
      const ts = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().timeScale();
      const r = ts.logicalRange();
      if (!r) return null;
      return {
        left: Number.isFinite(r._left) ? r._left : r.left,
        right: Number.isFinite(r._right) ? r._right : r.right,
      };
    })()`);
  }

  async function setLogicalRange(range) {
    const left = Number(range?.left);
    const right = Number(range?.right);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    await evaluate(`(() => {
      const ts = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().timeScale();
      ts.zoomToBarsRange(${left}, ${right});
    })()`);
    await new Promise(resolve => setTimeout(resolve, 400));
    return getLogicalRange();
  }

  const server = new McpServer({
    name: 'tradingview-chart-reader',
    version: '1.2.0',
    description: 'Read and navigate a local TradingView Desktop chart for ChatGPT',
    ...options.serverInfo,
  }, {
    instructions: `TradingView chart reader. Never execute trades. Call chart_get_state first. For any workflow that changes symbol, timeframe, visible range, or scroll position, call chart_snapshot_state before the first navigation change unless the user explicitly asks to keep the final chart state. Before giving the final answer, call chart_restore_state. Prefer summary=true for OHLCV unless individual bars are necessary. After changing symbol/timeframe, wait for render before capturing a screenshot.`,
    ...options.serverConfig,
  });

  const tools = createOutputSchemaToolRegistrar(server);
  registerHealthTools(tools, { includeLaunch: false });
  registerChartTools(tools);
  registerDataTools(tools);
  registerPaneTools(tools);

  tools.tool('chart_snapshot_state', 'Save current symbol, timeframe, chart type, and viewport before temporary navigation', {}, async () => {
    try {
      const [state, range, logicalRange] = await Promise.all([
        chartCore.getState(),
        chartCore.getVisibleRange(),
        getLogicalRange(),
      ]);
      savedChartState = {
        symbol: state.symbol,
        resolution: state.resolution,
        chartType: state.chartType,
        visibleRange: range.visible_range || null,
        logicalRange: logicalRange || null,
        savedAt: new Date().toISOString(),
      };
      return jsonResult({ success: true, snapshot: savedChartState });
    } catch (err) {
      return jsonResult({ success: false, error: err.message }, true);
    }
  });

  tools.tool('chart_restore_state', 'Restore the most recently saved chart snapshot after temporary navigation', {
    keep_snapshot: z.boolean().optional().describe('Keep snapshot after restore for reuse (default false)'),
  }, async ({ keep_snapshot }) => {
    try {
      if (!savedChartState) throw new Error('No chart snapshot exists. Call chart_snapshot_state first.');
      const snapshot = savedChartState;
      const before = await chartCore.getState();
      if (snapshot.symbol && before.symbol !== snapshot.symbol) {
        await chartCore.setSymbol({ symbol: snapshot.symbol });
      }
      const afterSymbol = await chartCore.getState();
      if (snapshot.resolution && afterSymbol.resolution !== snapshot.resolution) {
        await chartCore.setTimeframe({ timeframe: snapshot.resolution });
      }
      const afterTimeframe = await chartCore.getState();
      if (snapshot.chartType != null && afterTimeframe.chartType !== snapshot.chartType) {
        await chartCore.setType({ chart_type: String(snapshot.chartType) });
      }
      if (snapshot.visibleRange?.from != null && snapshot.visibleRange?.to != null) {
        await chartCore.setVisibleRange({
          from: snapshot.visibleRange.from,
          to: snapshot.visibleRange.to,
        });
      } else if (snapshot.logicalRange) {
        await setLogicalRange(snapshot.logicalRange);
      }
      const [current, currentRange, currentLogicalRange] = await Promise.all([
        chartCore.getState(),
        chartCore.getVisibleRange(),
        getLogicalRange(),
      ]);
      if (!keep_snapshot) savedChartState = null;
      return jsonResult({
        success: true,
        restored: snapshot,
        current: {
          symbol: current.symbol,
          resolution: current.resolution,
          chartType: current.chartType,
          visibleRange: currentRange.visible_range || null,
          logicalRange: currentLogicalRange || null,
        },
      });
    } catch (err) {
      return jsonResult({ success: false, error: err.message }, true);
    }
  });

  tools.tool('capture_screenshot', 'Capture the TradingView chart and return the PNG inline for visual analysis', {
    region: z.string().optional().describe('Region: full, chart, strategy_tester (default full)'),
    filename: z.string().optional().describe('Optional filename without extension'),
    method: z.string().optional().describe('Capture method: cdp or api (default cdp)'),
    wait_for_render: z.boolean().optional().describe('Wait for the chart canvas to stabilize before capture'),
  }, async ({ region, filename, method, wait_for_render }) => {
    try {
      const result = await capture.captureScreenshot({ region, filename, method, waitForRender: wait_for_render });
      if (!result?.success || !result?.file_path || result?.method !== 'cdp') return jsonResult(result);
      const png = readFileSync(result.file_path).toString('base64');
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) },
          { type: 'image', data: png, mimeType: 'image/png' },
        ],
        structuredContent: result,
      };
    } catch (err) {
      return jsonResult({ success: false, error: err.message }, true);
    }
  });

  return server;
}
