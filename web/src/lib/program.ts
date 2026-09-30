import { useOutletContext } from "react-router-dom";
import type { ProgramDetail } from "./api";

/** The school loaded by ProgramShell, for the pages inside it. */
export function useProgramContext(): ProgramDetail {
  return useOutletContext<ProgramDetail>();
}
