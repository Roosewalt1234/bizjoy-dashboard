import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchUniverse, type SearchResult } from "./useUniverseNodes";
import type { CenterEntity } from "./types";

interface UniverseSearchProps {
  onSelect: (entity: CenterEntity) => void;
}

export function UniverseSearch({ onSelect }: UniverseSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);

  async function handleChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const found = await searchUniverse(value);
    setResults(found);
    setOpen(true);
  }

  function handleSelect(result: SearchResult) {
    onSelect(result.center);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div style={{ position: "absolute", top: 16, right: 16, zIndex: 20, width: 260 }}>
      <div style={{ position: "relative" }}>
        <Search
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 14,
            height: 14,
            color: "#8a93a3",
          }}
        />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search contracts, work orders, staff..."
          style={{
            paddingLeft: 30,
            background: "#1c2128",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#e6edf3",
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => handleChange("")}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "#8a93a3",
              cursor: "pointer",
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div
          style={{
            marginTop: 4,
            background: "#1c2128",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => handleSelect(result)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                color: "#e6edf3",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700 }}>{result.label}</div>
              <div style={{ fontSize: 11, color: "#8a93a3" }}>{result.sublabel}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
