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
    <div className="ml-2 flex items-center gap-1.5">
      <label className="flex cursor-pointer items-center gap-1 truncate text-[10px] text-neutral-200 select-none hover:text-white">
        <input
          type="checkbox"
          checked={use1M}
          onChange={(e) => setUse1M(e.target.checked)}
          className="relative m-0 h-[11px] w-3 cursor-pointer appearance-none rounded-sm border border-neutral-800 bg-neutral-950 checked:border-sky-600 checked:bg-sky-600 checked:after:absolute checked:after:top-0 checked:after:left-[3px] checked:after:h-[6px] checked:after:w-1 checked:after:rotate-45 checked:after:border-r-[1.5px] checked:after:border-b-[1.5px] checked:after:border-solid checked:after:border-white checked:after:content-[''] hover:border-sky-600"
        />
        1M Context
      </label>
      <TooltipWrapper inline>
        <span className="flex cursor-help items-center text-[10px] leading-none text-neutral-500">
          ?
        </span>
        <Tooltip className="tooltip" align="center" width="auto">
          Enable 1M token context window (beta feature for Claude Sonnet 4/4.5)
        </Tooltip>
      </TooltipWrapper>
    </div>
  );
};
