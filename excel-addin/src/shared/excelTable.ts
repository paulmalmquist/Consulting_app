export type SelectedTableInfo = {
  tableName: string;
  headers: string[];
  rows: unknown[][];
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim();
}

export async function getSelectedTableInfo(): Promise<SelectedTableInfo | null> {
  if (typeof Excel === "undefined" || !Excel.run) {
    return null;
  }

  return Excel.run(async (context) => {
    const selected = context.workbook.getSelectedRange();
    const tables = selected.getTables(false);
    tables.load("items/name");
    await context.sync();

    if (!tables.items.length) {
      return null;
    }

    const table = tables.items[0];
    const headerRange = table.getHeaderRowRange();
    const bodyRange = table.getDataBodyRange();
    headerRange.load("values");
    bodyRange.load("values");
    await context.sync();

    const headers = (headerRange.values[0] ?? []).map(normalizeHeader);
    return {
      tableName: table.name,
      headers,
      rows: bodyRange.values,
    };
  });
}

export async function writeMatrixToSheet(matrix: unknown[][]): Promise<void> {
  if (!matrix.length || !matrix[0]?.length) {
    return;
  }
  if (typeof Excel === "undefined" || !Excel.run) {
    return;
  }

  await Excel.run(async (context) => {
    const selected = context.workbook.getSelectedRange();
    const target = selected.getResizedRange(matrix.length - 1, matrix[0].length - 1);
    target.values = matrix;
    await context.sync();
  });
}

export async function writeSyncStatusColumn(
  tableName: string,
  statuses: string[],
  columnName = "SyncStatus"
): Promise<void> {
  if (typeof Excel === "undefined" || !Excel.run) {
    return;
  }

  await Excel.run(async (context) => {
    const table = context.workbook.tables.getItem(tableName);
    table.columns.load("items/name");
    await context.sync();

    let syncColumn = table.columns.items.find((column) => column.name === columnName);
    if (!syncColumn) {
      syncColumn = table.columns.add(null, [columnName]);
      syncColumn.load("name");
      await context.sync();
    }

    const statusRange = syncColumn.getDataBodyRange();
    statusRange.load("values");
    await context.sync();

    const rowCount = statusRange.values.length;
    const nextValues = Array.from({ length: rowCount }).map((_, idx) => [statuses[idx] ?? ""]);
    statusRange.values = nextValues;
    await context.sync();
  });
}
