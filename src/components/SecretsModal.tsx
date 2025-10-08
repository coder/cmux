import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { Modal, ModalInfo, ModalActions, CancelButton, PrimaryButton } from "./Modal";
import type { Secret } from "@/types/secrets";

// Domain-specific styled components

const SecretsList = styled.div`
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
  min-height: 200px;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #424242;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #4e4e4e;
  }
`;

const SecretsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 4px;
  align-items: end;

  & > label {
    font-size: 11px;
    color: #888;
    margin-bottom: 3px;
  }
`;

const SecretInput = styled.input`
  padding: 6px 10px;
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  font-family: var(--font-monospace);
  width: 100%;

  &:focus {
    outline: none;
    border-color: #007acc;
  }

  &::placeholder {
    color: #666;
  }
`;

const ToggleVisibilityBtn = styled.button`
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 4px;
  border-radius: 3px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;

  &:hover {
    color: #ccc;
  }
`;

// Visibility toggle icon component
const ToggleVisibilityIcon: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (visible) {
    // Eye-off icon (with slash) - password is visible
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }

  // Eye icon - password is hidden
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
};

const RemoveBtn = styled.button`
  padding: 6px 10px;
  background: transparent;
  color: #ff5555;
  border: 1px solid #ff5555;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 85, 85, 0.1);
  }
`;

const AddSecretBtn = styled.button`
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  color: #888;
  border: 1px dashed #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  margin-bottom: 16px;

  &:hover {
    background: #2a2a2b;
    border-color: #555;
    color: #ccc;
  }
`;

const EmptyState = styled.div`
  padding: 32px 16px;
  text-align: center;
  color: #888;
  font-size: 13px;
`;

interface SecretsModalProps {
  isOpen: boolean;
  projectPath: string;
  projectName: string;
  initialSecrets: Secret[];
  onClose: () => void;
  onSave: (secrets: Secret[]) => Promise<void>;
}

const SecretsModal: React.FC<SecretsModalProps> = ({
  isOpen,
  projectPath: _projectPath,
  projectName,
  initialSecrets,
  onClose,
  onSave,
}) => {
  const [secrets, setSecrets] = useState<Secret[]>(initialSecrets);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Reset state when modal opens with new secrets
  useEffect(() => {
    if (isOpen) {
      setSecrets(initialSecrets);
      setVisibleSecrets(new Set());
    }
  }, [isOpen, initialSecrets]);

  const handleCancel = () => {
    setSecrets(initialSecrets);
    setVisibleSecrets(new Set());
    onClose();
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Filter out empty secrets
      const validSecrets = secrets.filter((s) => s.key.trim() !== "" && s.value.trim() !== "");
      await onSave(validSecrets);
      onClose();
    } catch (err) {
      console.error("Failed to save secrets:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const addSecret = () => {
    setSecrets([...secrets, { key: "", value: "" }]);
  };

  const removeSecret = (index: number) => {
    setSecrets(secrets.filter((_, i) => i !== index));
    // Clean up visibility state
    const newVisible = new Set(visibleSecrets);
    newVisible.delete(index);
    setVisibleSecrets(newVisible);
  };

  const updateSecret = (index: number, field: "key" | "value", value: string) => {
    const newSecrets = [...secrets];
    // Auto-capitalize key field for env variable convention
    const processedValue = field === "key" ? value.toUpperCase() : value;
    newSecrets[index] = { ...newSecrets[index], [field]: processedValue };
    setSecrets(newSecrets);
  };

  const toggleVisibility = (index: number) => {
    const newVisible = new Set(visibleSecrets);
    if (newVisible.has(index)) {
      newVisible.delete(index);
    } else {
      newVisible.add(index);
    }
    setVisibleSecrets(newVisible);
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Manage Secrets"
      subtitle={`Project: ${projectName}`}
      onClose={handleCancel}
      maxWidth="600px"
      maxHeight="80vh"
      isLoading={isLoading}
    >
      <ModalInfo>
        <p>
          Secrets are stored in <code>~/.cmux/secrets.json</code> (kept away from source code) but
          namespaced per project.
        </p>
        <p>Secrets are injected as environment variables to compute commands (e.g. Bash)</p>
      </ModalInfo>

      <SecretsList>
        {secrets.length === 0 ? (
          <EmptyState>No secrets configured</EmptyState>
        ) : (
          <SecretsGrid>
            <label>Key</label>
            <label>Value</label>
            <div /> {/* Empty cell for eye icon column */}
            <div /> {/* Empty cell for delete button column */}
            {secrets.map((secret, index) => (
              <React.Fragment key={index}>
                <SecretInput
                  type="text"
                  value={secret.key}
                  onChange={(e) => updateSecret(index, "key", e.target.value)}
                  placeholder="SECRET_NAME"
                  disabled={isLoading}
                />
                <SecretInput
                  type={visibleSecrets.has(index) ? "text" : "password"}
                  value={secret.value}
                  onChange={(e) => updateSecret(index, "value", e.target.value)}
                  placeholder="secret value"
                  disabled={isLoading}
                />
                <ToggleVisibilityBtn
                  type="button"
                  onClick={() => toggleVisibility(index)}
                  disabled={isLoading}
                >
                  <ToggleVisibilityIcon visible={visibleSecrets.has(index)} />
                </ToggleVisibilityBtn>
                <RemoveBtn type="button" onClick={() => removeSecret(index)} disabled={isLoading}>
                  ×
                </RemoveBtn>
              </React.Fragment>
            ))}
          </SecretsGrid>
        )}
      </SecretsList>

      <AddSecretBtn onClick={addSecret} disabled={isLoading}>
        + Add Secret
      </AddSecretBtn>

      <ModalActions>
        <CancelButton type="button" onClick={handleCancel} disabled={isLoading}>
          Cancel
        </CancelButton>
        <PrimaryButton type="button" onClick={() => void handleSave()} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save"}
        </PrimaryButton>
      </ModalActions>
    </Modal>
  );
};

export default SecretsModal;
