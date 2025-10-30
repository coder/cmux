import React, { useState, useCallback, useEffect, useRef } from "react";
import { Modal, ModalActions, CancelButton, PrimaryButton } from "./Modal";

/**
 * Project creation modal that handles the full flow from path input to backend validation.
 *
 * Listens for 'directory-select-request' custom events, displays a modal
 * for path input, calls the backend to create the project, and shows
 * validation errors inline. Modal stays open until project is successfully
 * created or user cancels.
 */
export const ProjectCreateModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const resolveRef = useRef<((result: { success: boolean; data?: unknown }) => void) | null>(null);

  // Listen for directory selection requests
  useEffect(() => {
    const handleDirectorySelectRequest = (e: Event) => {
      const customEvent = e as CustomEvent<{
        resolve: (result: { success: boolean; data?: unknown }) => void;
      }>;

      resolveRef.current = customEvent.detail.resolve;
      setPath("");
      setError("");
      setIsCreating(false);
      setIsOpen(true);
    };

    window.addEventListener("directory-select-request", handleDirectorySelectRequest);
    return () => {
      window.removeEventListener("directory-select-request", handleDirectorySelectRequest);
    };
  }, []);

  const handleCancel = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current({ success: false });
      resolveRef.current = null;
    }
    setIsOpen(false);
  }, []);

  const handleSelect = useCallback(async () => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setError("Please enter a directory path");
      return;
    }

    setError("");
    setIsCreating(true);

    try {
      // First check if project already exists
      const existingProjects = await window.api.projects.list();
      const existingPaths = new Map(existingProjects);
      
      // Try to create the project
      const result = await window.api.projects.create(trimmedPath);
      
      if (result.success) {
        // Check if duplicate (backend may normalize the path)
        const { normalizedPath } = result.data as { normalizedPath: string };
        if (existingPaths.has(normalizedPath)) {
          setError("This project has already been added.");
          return;
        }
        
        // Success - close modal and resolve
        if (resolveRef.current) {
          resolveRef.current({ success: true, data: result.data });
          resolveRef.current = null;
        }
        setIsOpen(false);
      } else {
        // Backend validation error - show inline, keep modal open
        const errorMessage =
          typeof result.error === "string" ? result.error : "Failed to add project";
        setError(errorMessage);
      }
    } catch (err) {
      // Unexpected error
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(`Failed to add project: ${errorMessage}`);
    } finally {
      setIsCreating(false);
    }
  }, [path]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleSelect();
      }
    },
    [handleSelect]
  );

  return (
    <Modal
      isOpen={isOpen}
      title="Add Project"
      subtitle="Enter the path to your project directory"
      onClose={handleCancel}
      isLoading={isCreating}
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
        disabled={isCreating}
        className="bg-modal-bg border-border-medium focus:border-accent placeholder:text-muted mb-5 w-full rounded border px-3 py-2 font-mono text-sm text-white focus:outline-none disabled:opacity-50"
      />
      {error && <div className="text-error -mt-3 mb-3 text-xs">{error}</div>}
      <ModalActions>
        <CancelButton onClick={handleCancel} disabled={isCreating}>
          Cancel
        </CancelButton>
        <PrimaryButton
          onClick={() => void handleSelect()}
          disabled={isCreating}
        >
          {isCreating ? "Adding..." : "Add Project"}
        </PrimaryButton>
      </ModalActions>
    </Modal>
  );
};
