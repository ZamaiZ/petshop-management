"use client";

import { useMemo, type ReactNode } from "react";
import {
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  columnFilteringFeature,
  flexRender,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { LuArrowDown, LuArrowUp, LuArrowUpDown, LuSearch } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

export type DataTableColumn<TData extends RowData> = ColumnDef<typeof features, TData>;

export function DataTable<TData extends RowData>({
  columns,
  data,
  searchPlaceholder = "Buscar…",
  emptyMessage = "Nenhum registro encontrado.",
  toolbarActions,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  toolbarActions?: ReactNode;
}) {
  const stableData = useMemo(() => data, [data]);
  const table = useTable({
    features,
    columns,
    data: stableData,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });
  const pageCount = table.getPageCount();

  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
      <div className="flex flex-col justify-between gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
        <div className="relative w-full max-w-[310px]">
          <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={table.state.globalFilter ?? ""}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 rounded-md pl-9 text-[11px]"
          />
        </div>
        {toolbarActions ? <div className="flex flex-wrap items-center gap-2">{toolbarActions}</div> : null}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="bg-muted/70 hover:bg-muted/70">
                {group.headers.map((header) => (
                  <TableHead key={header.id} className="h-10 whitespace-nowrap px-4 text-[10px] font-medium sm:px-5">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1.5 text-left outline-none focus-visible:underline"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? <LuArrowUp className="size-3" /> : header.column.getIsSorted() === "desc" ? <LuArrowDown className="size-3" /> : <LuArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="px-4 py-3.5 text-[11px] sm:px-5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={columns.length} className="h-28 text-center text-xs text-muted-foreground">{emptyMessage}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-5">
        <p className="text-[10px] text-muted-foreground">{table.getFilteredRowModel().rows.length} registros</p>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-[10px]" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Anterior</Button>
          <span className="min-w-12 text-center text-[10px] tabular-nums text-muted-foreground">{table.state.pagination.pageIndex + 1} / {Math.max(pageCount, 1)}</span>
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-[10px]" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Próxima</Button>
        </div>
      </div>
    </div>
  );
}
