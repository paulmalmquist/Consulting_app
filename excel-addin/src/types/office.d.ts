declare namespace Office {
  const onReady: (callback?: (info: { host: string }) => void) => Promise<{ host: string }>;
}

declare namespace OfficeRuntime {
  const storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
}

declare namespace CustomFunctions {
  function associate(id: string, func: (...args: any[]) => any): void;
}

declare namespace Excel {
  interface RequestContext {
    workbook: Workbook;
    sync(): Promise<void>;
  }

  interface Workbook {
    settings: SettingsCollection;
    tables: TableCollection;
    getSelectedRange(): Range;
  }

  interface SettingsCollection {
    add(key: string, value: unknown): void;
    getItemOrNullObject(key: string): Setting;
  }

  interface Setting {
    value: unknown;
    isNullObject: boolean;
    load(property: string): void;
  }

  interface TableCollection {
    items: Table[];
    load(property: string): void;
    getItem(name: string): Table;
  }

  interface Table {
    name: string;
    load(property: string): void;
    getHeaderRowRange(): Range;
    getDataBodyRange(): Range;
    columns: TableColumnCollection;
    rows: TableRowCollection;
    getRange(): Range;
  }

  interface TableColumnCollection {
    load(property: string): void;
    items: TableColumn[];
    add(index: number | null, values: string[]): TableColumn;
    getItem(name: string): TableColumn;
  }

  interface TableColumn {
    name: string;
    load(property: string): void;
    getDataBodyRange(): Range;
  }

  interface TableRowCollection {
    add(index: number | null, values: unknown[][]): void;
  }

  interface Range {
    values: unknown[][];
    load(property: string): void;
    getSurroundingRegion(): Range;
    getTables(fullyContained?: boolean): TableCollection;
    getResizedRange(deltaRows: number, deltaColumns: number): Range;
    getOffsetRange(rowOffset: number, columnOffset: number): Range;
  }

  function run<T>(callback: (context: RequestContext) => Promise<T>): Promise<T>;
}
