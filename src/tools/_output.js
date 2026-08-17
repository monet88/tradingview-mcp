import { z } from 'zod';

const openObject = z.object({}).passthrough();
const itemArray = z.array(z.unknown());
const stringArray = z.array(z.string());
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const range = z.object({
  from: z.number(),
  to: z.number(),
}).passthrough();

function result(shape = {}) {
  return z.object({
    success: z.boolean().describe('Whether the TradingView operation succeeded'),
    error: z.string().optional().describe('Human-readable error when the operation failed'),
    hint: z.string().optional().describe('Optional recovery or next-step guidance'),
    ...shape,
  }).passthrough();
}

const genericOutputSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().optional(),
  hint: z.string().optional(),
  value: z.unknown().optional(),
}).passthrough();

const studyList = z.array(z.object({
  id: z.string(),
  name: z.string(),
}).passthrough());

const remoteToolOutputSchemas = {
  tv_health_check: result({
    cdp_connected: z.boolean().optional(),
    target_id: z.string().optional(),
    target_url: z.string().optional(),
    target_title: z.string().optional(),
    chart_symbol: z.string().optional(),
    chart_resolution: z.string().optional(),
    chart_type: scalar.nullable().optional(),
    api_available: z.boolean().optional(),
  }),
  tv_discover: result({
    apis_available: z.number().optional(),
    apis_total: z.number().optional(),
    apis: openObject.optional(),
  }),
  tv_ui_state: result({
    bottom_panel: openObject.optional(),
    right_panel: openObject.optional(),
    pine_editor: openObject.optional(),
  }),
  tv_update: result({
    updated: z.boolean().optional(),
    status: z.string().optional(),
    commit: z.string().optional(),
    from_commit: z.string().optional(),
    to_commit: z.string().optional(),
    commits_pulled: z.number().optional(),
    deps_installed: z.boolean().optional(),
    restart_required: z.boolean().optional(),
    changed_files: stringArray.optional(),
    warning: z.string().optional(),
    note: z.string().optional(),
  }),
  chart_get_state: result({
    symbol: z.string().optional(),
    resolution: z.string().optional(),
    chartType: scalar.nullable().optional(),
    studies: studyList.optional(),
  }),
  chart_set_symbol: result({
    symbol: z.string().optional(),
    chart_ready: z.boolean().optional(),
  }),
  chart_set_timeframe: result({
    timeframe: z.string().optional(),
    chart_ready: z.boolean().optional(),
  }),
  chart_set_type: result({
    chart_type: z.string().optional(),
    type_num: z.number().optional(),
  }),
  chart_manage_indicator: result({
    action: z.string().optional(),
    indicator: z.string().optional(),
    entity_id: z.string().optional(),
    new_study_count: z.number().optional(),
    inputs: z.unknown().optional(),
  }),
  chart_get_visible_range: result({
    visible_range: range.optional(),
    bars_range: openObject.optional(),
  }),
  chart_set_visible_range: result({
    requested: range.optional(),
    actual: range.optional(),
  }),
  chart_scroll_to_date: result({
    date: z.string().optional(),
    centered_on: z.number().optional(),
    resolution: z.string().optional(),
    window: range.optional(),
  }),
  symbol_info: result({
    symbol: z.string().optional(),
    full_name: z.string().optional(),
    exchange: z.string().optional(),
    description: z.string().optional(),
    type: z.string().optional(),
    pro_name: z.string().optional(),
  }),
  symbol_search: result({
    query: z.string().optional(),
    source: z.string().optional(),
    results: itemArray.optional(),
    count: z.number().optional(),
  }),
  data_get_ohlcv: result({
    bar_count: z.number().optional(),
    total_available: z.number().optional(),
    source: z.string().optional(),
    bars: itemArray.optional(),
    period: range.optional(),
    open: z.number().optional(),
    close: z.number().optional(),
    high: z.number().optional(),
    low: z.number().optional(),
    range: z.number().optional(),
    change: z.number().optional(),
    change_pct: z.string().optional(),
    avg_volume: z.number().optional(),
    last_5_bars: itemArray.optional(),
  }),
  data_get_indicator: result({
    entity_id: z.string().optional(),
    visible: z.boolean().nullable().optional(),
    inputs: z.unknown().optional(),
  }),
  data_get_strategy_results: result({
    metric_count: z.number().optional(),
    strategy: z.string().optional(),
    currency: z.string().optional(),
    source: z.string().optional(),
    metrics: openObject.optional(),
    unhidden_strategies: itemArray.optional(),
    note: z.string().optional(),
  }),
  data_get_trades: result({
    trade_count: z.number().optional(),
    total_orders: z.number().optional(),
    source: z.string().optional(),
    trades: itemArray.optional(),
    unhidden_strategies: itemArray.optional(),
    note: z.string().optional(),
  }),
  data_get_equity: result({
    data_points: z.number().optional(),
    source: z.string().optional(),
    data: itemArray.optional(),
    buy_hold_points: z.unknown().optional(),
    unhidden_strategies: itemArray.optional(),
    note: z.string().optional(),
  }),
  quote_get: result({
    symbol: z.string().optional(),
    last: z.unknown().optional(),
    open: z.unknown().optional(),
    high: z.unknown().optional(),
    low: z.unknown().optional(),
    close: z.unknown().optional(),
    volume: z.unknown().optional(),
  }),
  depth_get: result({
    bid_levels: z.number().optional(),
    ask_levels: z.number().optional(),
    spread: z.unknown().optional(),
    bids: itemArray.optional(),
    asks: itemArray.optional(),
    raw_values: z.unknown().optional(),
    note: z.string().optional(),
  }),
  data_get_pine_lines: result({
    study_count: z.number().optional(),
    studies: itemArray.optional(),
  }),
  data_get_pine_labels: result({
    study_count: z.number().optional(),
    studies: itemArray.optional(),
  }),
  data_get_pine_tables: result({
    study_count: z.number().optional(),
    studies: itemArray.optional(),
  }),
  data_get_pine_boxes: result({
    study_count: z.number().optional(),
    studies: itemArray.optional(),
  }),
  data_get_study_values: result({
    study_count: z.number().optional(),
    studies: itemArray.optional(),
  }),
  pane_list: result({
    layout: scalar.optional(),
    layout_name: z.string().optional(),
    chart_count: z.number().optional(),
    active_index: z.number().optional(),
    panes: itemArray.optional(),
  }),
  pane_set_layout: result({
    layout: scalar.optional(),
    layout_name: z.string().optional(),
    chart_count: z.number().optional(),
    panes: itemArray.optional(),
  }),
  pane_focus: result({
    focused_index: z.number().optional(),
    total_panes: z.number().optional(),
  }),
  pane_set_symbol: result({
    index: z.number().optional(),
    symbol: z.string().optional(),
  }),
  chart_snapshot_state: result({
    snapshot: openObject.optional(),
  }),
  chart_restore_state: result({
    restored: openObject.optional(),
    current: openObject.optional(),
  }),
  capture_screenshot: result({
    method: z.string().optional(),
    file_path: z.string().optional(),
    region: z.string().optional(),
    waited_for_render: z.boolean().optional(),
    size_bytes: z.number().optional(),
    note: z.string().optional(),
  }),
};

export function outputSchemaForTool(name) {
  return remoteToolOutputSchemas[name] || genericOutputSchema;
}

export function createOutputSchemaToolRegistrar(server) {
  return {
    tool(name, description, inputSchema, callback) {
      return server.registerTool(name, {
        description,
        inputSchema,
        outputSchema: outputSchemaForTool(name),
      }, callback);
    },
  };
}
