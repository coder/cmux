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
  width: 14px;
  height: 14px;
  accent-color: #007acc;
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
