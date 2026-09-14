import type { Mod } from "../types";

type TypeFilter = "all" | "bug" | "idea";
type SortOrder = "newest" | "oldest";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: TypeFilter;
  onTypeFilterChange: (value: TypeFilter) => void;
  modFilter: string;
  onModFilterChange: (value: string) => void;
  mods: Mod[];
  sort: SortOrder;
  onSortChange: (value: SortOrder) => void;
  resultCount: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onBulkDelete: () => void;
}

export default function QueueToolbar({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  modFilter,
  onModFilterChange,
  mods,
  sort,
  onSortChange,
  resultCount,
  selectedCount,
  allSelected,
  onToggleSelectAll,
  onBulkApprove,
  onBulkReject,
  onBulkDelete,
}: Props) {
  const noneSelected = selectedCount === 0;
  return (
    <div className="panel queue-toolbar">
      <div className="queue-toolbar-fields">
        <label className="queue-field queue-field-search">
          Search
          <input
            className="form-input"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Title or author"
            aria-label="Search submissions"
          />
        </label>
        <label className="queue-field">
          Type
          <select className="form-input" value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value as TypeFilter)} aria-label="Filter by type">
            <option value="all">All types</option>
            <option value="bug">Bugs</option>
            <option value="idea">Ideas</option>
          </select>
        </label>
        <label className="queue-field">
          Mod
          <select className="form-input" value={modFilter} onChange={(event) => onModFilterChange(event.target.value)} aria-label="Filter by mod">
            <option value="all">All mods</option>
            <option value="global">Global</option>
            {mods.map((mod) => <option key={mod.id} value={mod.id}>{mod.name}</option>)}
          </select>
        </label>
        <label className="queue-field">
          Sort
          <select className="form-input" value={sort} onChange={(event) => onSortChange(event.target.value as SortOrder)} aria-label="Sort submissions">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>
      <div className="queue-toolbar-actions">
        <span className="queue-count">{resultCount} result{resultCount === 1 ? "" : "s"}{selectedCount > 0 ? ` · ${selectedCount} selected` : ""}</span>
        <label className="queue-select-all">
          <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} disabled={resultCount === 0} aria-label="Select all filtered submissions" />
          Select all
        </label>
        <div className="queue-bulk">
          <button className="btn btn-accent btn-sm" type="button" onClick={onBulkApprove} disabled={noneSelected}>Bulk approve</button>
          <button className="btn btn-sm" type="button" onClick={onBulkReject} disabled={noneSelected}>Bulk reject</button>
          <button className="btn btn-danger btn-sm" type="button" onClick={onBulkDelete} disabled={noneSelected}>Bulk delete</button>
        </div>
      </div>
    </div>
  );
}
