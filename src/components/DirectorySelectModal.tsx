import React, { useState, useCallback, useEffect, useRef } from "react";
import { Modal, ModalActions, CancelButton, PrimaryButton } from "./Modal";

/**
 * Self-contained directory selection modal for browser mode.
 *
 * Listens for 'directory-select-request' custom events and displays
 * a modal for the user to enter a directory path. The promise from
 * the event is resolved with the selected path or null if cancelled.
 */
export const DirectorySelectModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const resolveRef = useRef<((path: string | null) => void) | null>(null);

  // Listen for directory selection requests
  useEffect(() => {
    const handleDirectorySelectRequest = (e: Event) => {
      const customEvent = e as CustomEvent<{
        resolve: (path: string | null) => void;
      }>;

      resolveRef.current = customEvent.detail.resolve;
      setPath("");
      setError("");
      setIsOpen(true);
    };

    window.addEventListener("directory-select-request", handleDirectorySelectRequest);
    return () => {
      window.removeEventListener("directory-select-request", handleDirectorySelectRequest);
    };
  }, []);

  const handleCancel = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(null);
      resolveRef.current = null;
    }
    setIsOpen(false);
  }, []);

  const handleSelect = useCallback(() => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setError("Please enter a directory path");
      return;
    }

    if (resolveRef.current) {
      resolveRef.current(trimmedPath);
      resolveRef.current = null;
    }
    setIsOpen(false);
  }, [path]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSelect();
      }
    },
    [handleSelect]
  );

  return (
    <Modal
      isOpen={isOpen}
      title="Select Project Directory"
      subtitle="Enter the path to your project directory on the server"
      onClose={handleCancel}
    >
      <input
        type="text"
        value={path}
        onChange={(e) => {
          setPath(e.target.value);
          setError("");
        }}
        onKeyDown={handleKeyDown}
        placeholder="/home/user/projects/my-project"
        autoFocus
        className="mb-5 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 font-mono text-sm text-white placeholder:text-gray-500 focus:border-sky-600 focus:outline-none"
      />
      {error && <div className="text-error -mt-3 mb-3 text-xs">{error}</div>}
      <ModalActions>
        <CancelButton onClick={handleCancel}>Cancel</CancelButton>
        <PrimaryButton onClick={handleSelect}>Select</PrimaryButton>
      </ModalActions>
    </Modal>
  );
};
