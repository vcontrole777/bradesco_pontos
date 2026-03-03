import { useEffect, useState } from "react";
import { flowRepository, type FlowStep } from "@/repositories";

let cachedSteps: FlowStep[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000; // 30s

async function loadSteps(): Promise<FlowStep[]> {
  if (cachedSteps && Date.now() - cacheTime < CACHE_TTL) return cachedSteps;

  const steps = await flowRepository.getAll();
  cachedSteps = steps;
  cacheTime = Date.now();
  return steps;
}

export function invalidateFlowCache(): void {
  cachedSteps = null;
}

export function useFlowNavigation() {
  const [steps, setSteps] = useState<FlowStep[]>(cachedSteps ?? []);

  useEffect(() => {
    loadSteps().then(setSteps).catch(console.error);
  }, []);

  const enabledSteps = steps
    .filter((s) => s.enabled)
    .sort((a, b) => a.step_order - b.step_order);

  const getNextStep = (currentKey: string): string => {
    const idx = enabledSteps.findIndex((s) => s.step_key === currentKey);
    if (idx === -1 || idx >= enabledSteps.length - 1) return "/concluido";
    const next = enabledSteps[idx + 1];
    return next.step_key === "splash" ? "/" : `/${next.step_key}`;
  };

  const getPrevStep = (currentKey: string): string => {
    const idx = enabledSteps.findIndex((s) => s.step_key === currentKey);
    if (idx <= 0) return "/";
    const prev = enabledSteps[idx - 1];
    return prev.step_key === "splash" ? "/" : `/${prev.step_key}`;
  };

  return { steps: enabledSteps, getNextStep, getPrevStep, allSteps: steps };
}
