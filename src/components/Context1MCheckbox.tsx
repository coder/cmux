import React from "react";
import { use1MContext } from "@/hooks/use1MContext";
import { supports1MContext } from "@/utils/ai/models";
import { TooltipWrapper, Tooltip } from "./Tooltip";

interface Context1MCheckboxProps {
  modelString: string;
}

export const Context1MCheckbox: React.FC<Context1MCheckboxProps> = ({ modelString }) => {
  const [use1M, setUse1M] = use1MContext();
  const isSupported = supports1MContext(modelString);

  if (!isSupported) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 ml-2">
      <label className="flex items-center gap-1 text-[10px] text-foreground cursor-pointer select-none whitespace-nowrap overflow-hidden text-ellipsis hover:text-white">
        <input
          type="checkbox"
          checked={use1M}
          onChange={(e) => setUse1M(e.target.checked)}
          className="cursor-pointer w-[11px] h-[11px] m-0 appearance-none border border-border-light rounded-sm bg-dark relative hover:border-accent checked:bg-accent checked:border-accent checked:after:content-[''] checked:after:absolute checked:after:left-[3px] checked:after:top-0 checked:after:w-[3px] checked:after:h-[6px] checked:after:border-solid checked:after:border-white checked:after:border-r-[1.5px] checked:after:border-b-[1.5px] checked:after:rotate-45"
        />
        1M Context
      </label>
      <TooltipWrapper inline>
        <span className="cursor-help text-muted text-[10px] leading-none flex items-center">?</span>
        <Tooltip className="tooltip" align="center" width="auto">
          Enable 1M token context window (beta feature for Claude Sonnet 4/4.5)
        </Tooltip>
      </TooltipWrapper>
    </div>
  );
};
