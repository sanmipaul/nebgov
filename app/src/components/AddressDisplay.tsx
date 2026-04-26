"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  getAddressLabel,
  setCustomLabel,
  removeCustomLabel,
  exportCustomLabels,
  importCustomLabels,
} from "../lib/address-labels";

interface AddressDisplayProps {
  address: string;
  truncate?: boolean;
  showFullOnHover?: boolean;
  className?: string;
}

function truncateAddress(addr: string, chars = 6): string {
  if (addr.length <= chars * 2) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

export function AddressDisplay({
  address,
  truncate = true,
  showFullOnHover = true,
  className = "",
}: AddressDisplayProps) {
  const label = getAddressLabel(address);
  const displayAddress = truncate ? truncateAddress(address) : address;
  const [showMenu, setShowMenu] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSaveLabel = () => {
    if (newLabel.trim()) {
      setCustomLabel(address, newLabel.trim());
      setNewLabel("");
    }
    setShowMenu(false);
  };

  const handleRemoveLabel = () => {
    removeCustomLabel(address);
    setShowMenu(false);
  };

  const handleExport = () => {
    const data = exportCustomLabels();
    navigator.clipboard.writeText(data);
    alert("Labels exported to clipboard");
  };

  const handleImport = () => {
    const data = prompt("Paste exported labels JSON:");
    if (data && importCustomLabels(data)) {
      window.location.reload();
    }
  };

  return (
    <div className={`relative inline-block ${className}`} ref={menuRef}>
      <div
        className="cursor-context-menu"
        onContextMenu={(e) => {
          e.preventDefault();
          setShowMenu(!showMenu);
        }}
      >
        {label ? (
          <span className="font-medium">
            {label}{" "}
            <span className="text-gray-400 dark:text-gray-500 font-mono text-sm">
              ({displayAddress})
            </span>
          </span>
        ) : (
          <span className="font-mono text-sm">{displayAddress}</span>
        )}
      </div>

      {showFullOnHover && !label && (
        <div className="absolute z-50 hidden group-hover:block bottom-full left-0 mb-1 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap">
          {address}
        </div>
      )}

      {showMenu && (
        <div className="absolute z-50 right-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2">
          {label ? (
            <>
              <button
                onClick={() => {
                  setNewLabel(label);
                  setShowMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Edit label &quot;{label}&quot;
              </button>
              <button
                onClick={handleRemoveLabel}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Remove label
              </button>
            </>
          ) : (
            <div className="px-4 py-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Enter label..."
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
                onKeyDown={(e) => e.key === "Enter" && handleSaveLabel()}
              />
              <button
                onClick={handleSaveLabel}
                disabled={!newLabel.trim()}
                className="mt-2 w-full px-2 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                Save Label
              </button>
            </div>
          )}
          <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
            <button
              onClick={handleExport}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Export labels
            </button>
            <button
              onClick={handleImport}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Import labels
            </button>
          </div>
        </div>
      )}
    </div>
  );
}