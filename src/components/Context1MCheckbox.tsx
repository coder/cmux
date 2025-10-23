import React from "react";
import { use1MContext } from "@/hooks/use1MContext";
import { supports1MContext } from "@/utils/ai/models";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

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
      <label className="text-foreground flex cursor-pointer items-center gap-1 truncate text-[10px] select-none hover:text-white">
        <input
          type="checkbox"
          checked={use1M}
          onChange={(e) => setUse1M(e.target.checked)}
          className="border-border-light bg-dark hover:border-accent checked:bg-accent checked:border-accent relative m-0 h-[11px] w-3 cursor-pointer appearance-none rounded-sm border checked:after:absolute checked:after:top-0 checked:after:left-[3px] checked:after:h-[6px] checked:after:w-1 checked:after:rotate-45 checked:after:border-r-[1.5px] checked:after:border-b-[1.5px] checked:after:border-solid checked:after:border-white checked:after:content-['']"
        />
        1M Context
      </label>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted flex cursor-help items-center text-[10px] leading-none">
            ?
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Enable 1M token context window (beta feature for Claude Sonnet 4/4.5)
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
