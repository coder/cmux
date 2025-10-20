import React, { useState, useCallback, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { Modal, ModalActions, CancelButton, PrimaryButton } from "./Modal";

const InputField = styled.input`
  width: 100%;
  padding: 8px 12px;
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
  font-family: var(--font-monospace);
  margin-bottom: 20px;

  &:focus {
    outline: none;
    border-color: #007acc;
  }

  &::placeholder {
    color: #888;
  }
`;

const ErrorText = styled.div`
  color: var(--color-error);
  font-size: 12px;
  margin-top: -12px;
  margin-bottom: 12px;
`;

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
      <InputField
        type="text"
        value={path}
        onChange={(e) => {
          setPath(e.target.value);
          setError("");
        }}
        onKeyDown={handleKeyDown}
        placeholder="/home/user/projects/my-project"
        autoFocus
      />
      {error && <ErrorText>{error}</ErrorText>}
      <ModalActions>
        <CancelButton onClick={handleCancel}>Cancel</CancelButton>
        <PrimaryButton onClick={handleSelect}>Select</PrimaryButton>
      </ModalActions>
    </Modal>
  );
};
