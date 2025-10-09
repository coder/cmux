import React from "react";
import styled from "@emotion/styled";
import { use1MContext } from "@/hooks/use1MContext";
import { supports1MContext } from "@/utils/ai/models";
import { TooltipWrapper, Tooltip } from "./Tooltip";

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 20px;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #cccccc;
  cursor: pointer;
  user-select: none;

  &:hover {
    color: #ffffff;
  }
`;

const Checkbox = styled.input`
  cursor: pointer;
  width: 11px;
  height: 11px;
  margin: 0;
  appearance: none;
  border: 1px solid #3e3e42;
  border-radius: 2px;
  background: #1e1e1e;
  position: relative;
  
  &:hover {
    border-color: #007acc;
  }
  
  &:checked {
    background: #007acc;
    border-color: #007acc;
  }
  
  &:checked::after {
    content: '';
    position: absolute;
    left: 3px;
    top: 1px;
    width: 3px;
    height: 6px;
    border: solid white;
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
`;

interface Context1MCheckboxProps {
  workspaceId: string;
  modelString: string;
}

export const Context1MCheckbox: React.FC<Context1MCheckboxProps> = ({
  workspaceId,
  modelString,
}) => {
  const [use1M, setUse1M] = use1MContext(workspaceId);
  const isSupported = supports1MContext(modelString);

  if (!isSupported) {
    return null;
  }

  return (
    <CheckboxContainer>
      <CheckboxLabel>
        <Checkbox
          type="checkbox"
          checked={use1M}
          onChange={(e) => setUse1M(e.target.checked)}
        />
        1M Context
      </CheckboxLabel>
      <TooltipWrapper inline>
        <span style={{ cursor: "help", color: "#888", fontSize: "10px" }}>?</span>
        <Tooltip className="tooltip" align="center" width="auto">
          Enable 1M token context window (beta feature for Claude Sonnet 4/4.5)
        </Tooltip>
      </TooltipWrapper>
    </CheckboxContainer>
  );
};
